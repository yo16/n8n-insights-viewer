/**
 * deploy-collector CLIのオーケストレーション本体。
 *
 * docs/design/data-sync-design.md §4.1 承認フロー準拠:
 * 1. 設置プラン（配置先・crontab行・スクリプト全文）を表示
 * 2. `--dry-run` なら表示のみで終了（実行しない）
 * 3. ユーザーの明示的な承認（yes）を待ってから実行
 * 4. 専用ディレクトリ作成 → collector.sh転送(scp) → 実行権限付与 →
 *    crontab読み取り→冪等マージ→書き戻し → 設置後の検証
 * 5. アンインストール手順を表示
 *
 * gcloudの実行は `CommandRunner` に委譲し、本ファイルは実gcloudを直接呼ばない
 * （単体テストではフェイクRunnerを注入し、実gcloudを一切実行しない）。
 */

import type { CommandRunner } from "../sync/commandRunner";
import { getDefaultGcloudSyncConfig, type GcloudSyncConfig } from "../sync/config";
import {
  getDefaultDeployCollectorConfig,
  type DeployCollectorConfig,
} from "./deployConfig";
import {
  buildChmodCommand,
  buildMkdirCommand,
  buildReadCrontabCommand,
  buildScpUploadCommand,
  buildVerifyCommand,
  buildWriteCrontabCommand,
} from "./deployCommands";
import { mergeCrontab } from "./crontab";
import { renderCollectorScript } from "./renderTemplate";
import { formatPlan, formatUninstallInstructions, type DeployPlan } from "./plan";

/** `runDeployCollector` の実行オプション。 */
export interface RunDeployCollectorOptions {
  /** コマンド実行層（実運用では `GcloudCommandRunner`、テストではフェイクを注入）。 */
  runner: CommandRunner;
  /** `collector.sh.template` の内容。 */
  templateContent: string;
  /** gcloud接続先設定。省略時は既定値。 */
  gcloudConfig?: GcloudSyncConfig;
  /** deploy-collectorの設置設定。省略時は既定値。 */
  deployConfig?: DeployCollectorConfig;
  /** trueなら表示のみで終了し、実行・承認確認を一切行わない。 */
  dryRun?: boolean;
  /** ユーザーへ承認を求め、承認されたら`true`を返す。 */
  confirm: () => Promise<boolean>;
  /** 表示・ログ出力（実運用ではconsole.log等を注入）。 */
  log: (message: string) => void;
  /** レンダリング済みスクリプトをローカル一時ファイルへ書き出し、そのパスを返す（scpのソース）。 */
  writeLocalTempFile: (content: string) => Promise<string>;
  /** ローカル一時ファイルの削除（後始末）。省略時は削除しない。 */
  removeLocalTempFile?: (filePath: string) => Promise<void>;
}

/** `runDeployCollector` の実行結果。 */
export interface DeployCollectorResult {
  /**
   * - `planned`: dry-runで表示のみ実施
   * - `aborted`: ユーザーが承認しなかった（何も変更していない）
   * - `success`: 設置完了
   * - `failed`: 設置中にエラーが発生
   */
  status: "planned" | "aborted" | "success" | "failed";
  errorMessage?: string;
}

/**
 * deploy-collectorの設置フローを実行する。
 */
export async function runDeployCollector(
  options: RunDeployCollectorOptions,
): Promise<DeployCollectorResult> {
  const gcloudConfig = options.gcloudConfig ?? getDefaultGcloudSyncConfig();
  const deployConfig =
    options.deployConfig ?? getDefaultDeployCollectorConfig();

  const renderedScript = renderCollectorScript(options.templateContent, {
    version: deployConfig.collectorVersion,
    dbPath: deployConfig.remoteDbPath,
    outputFile: deployConfig.remoteOutputPath,
  });

  const plan: DeployPlan = {
    remoteDir: deployConfig.remoteDir,
    remoteScriptPath: deployConfig.remoteScriptPath,
    cronLine: deployConfig.cronLine,
    renderedScript,
    project: gcloudConfig.project,
    zone: gcloudConfig.zone,
    instance: gcloudConfig.instance,
  };

  options.log(formatPlan(plan));

  if (options.dryRun) {
    options.log(
      "[deploy-collector] --dry-run のため、ここで終了します（実行・承認確認は行いません）",
    );
    return { status: "planned" };
  }

  const approved = await options.confirm();
  if (!approved) {
    options.log(
      "[deploy-collector] ユーザーが承認しなかったため中止しました（何も変更していません）",
    );
    return { status: "aborted" };
  }

  let localTempFile: string | undefined;
  try {
    localTempFile = await options.writeLocalTempFile(renderedScript);

    const mkdir = buildMkdirCommand(gcloudConfig, deployConfig.remoteDir);
    const mkdirResult = await options.runner.run(mkdir.command, mkdir.args);
    if (mkdirResult.exitCode !== 0) {
      throw new Error(
        `専用ディレクトリの作成に失敗しました: ${mkdirResult.stderr || mkdirResult.stdout}`,
      );
    }

    const scp = buildScpUploadCommand(
      gcloudConfig,
      localTempFile,
      deployConfig.remoteScriptPath,
    );
    const scpResult = await options.runner.run(scp.command, scp.args);
    if (scpResult.exitCode !== 0) {
      throw new Error(
        `collector.shの転送に失敗しました: ${scpResult.stderr || scpResult.stdout}`,
      );
    }

    const chmod = buildChmodCommand(
      gcloudConfig,
      deployConfig.remoteScriptPath,
    );
    const chmodResult = await options.runner.run(chmod.command, chmod.args);
    if (chmodResult.exitCode !== 0) {
      throw new Error(
        `実行権限の付与に失敗しました: ${chmodResult.stderr || chmodResult.stdout}`,
      );
    }

    const readCrontab = buildReadCrontabCommand(gcloudConfig);
    const readResult = await options.runner.run(
      readCrontab.command,
      readCrontab.args,
    );
    // 「crontab未設定」と「読み取りコマンド自体の失敗」を区別する:
    // buildReadCrontabCommand が組み立てるリモートスクリプトは
    // `crontab -l 2>/dev/null || true` であり、crontab未設定時（`crontab -l`が
    // 失敗する場合）でも `|| true` でexitCodeを常に0・stdoutを空文字列に
    // 正規化している（scripts/deploy-collector/deployCommands.ts参照）。
    // そのため、ここで exitCode !== 0 になるのは ssh 自体の失敗
    // （ネットワーク断・認証エラー等）のみであり、
    // 「stdoutが空 = crontab未設定」と誤認して全消しで書き戻すことを防ぐため、
    // このケースでは書き戻しを一切行わずに中止する。
    if (readResult.exitCode !== 0) {
      throw new Error(
        `既存crontabの読み取りに失敗しました（ネットワーク断・認証エラー等の可能性があり、` +
          `安全のためcrontabの書き戻しを中止しました）: ${readResult.stderr || readResult.stdout}`,
      );
    }
    const newCrontabContent = mergeCrontab(
      readResult.stdout,
      deployConfig.cronLine,
      deployConfig.remoteScriptPath,
    );

    const writeCrontab = buildWriteCrontabCommand(
      gcloudConfig,
      newCrontabContent,
    );
    const writeResult = await options.runner.run(
      writeCrontab.command,
      writeCrontab.args,
    );
    if (writeResult.exitCode !== 0) {
      throw new Error(
        `crontabの更新に失敗しました: ${writeResult.stderr || writeResult.stdout}`,
      );
    }

    const verify = buildVerifyCommand(
      gcloudConfig,
      deployConfig.remoteScriptPath,
    );
    const verifyResult = await options.runner.run(verify.command, verify.args);
    const scriptOk = verifyResult.stdout.includes("SCRIPT_OK");
    const cronOk = verifyResult.stdout.includes("CRON_OK");

    if (!scriptOk || !cronOk) {
      options.log(
        `[deploy-collector] 検証で警告があります（script_ok=${scriptOk}, cron_ok=${cronOk}）: ${verifyResult.stdout.trim()}`,
      );
    } else {
      options.log(
        "[deploy-collector] 設置を確認しました（collector.shの存在・crontab行ともにOK）",
      );
    }

    options.log(formatUninstallInstructions(plan));

    return { status: "success" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    options.log(`[deploy-collector] 設置に失敗しました: ${message}`);
    return { status: "failed", errorMessage: message };
  } finally {
    if (localTempFile && options.removeLocalTempFile) {
      await options.removeLocalTempFile(localTempFile);
    }
  }
}
