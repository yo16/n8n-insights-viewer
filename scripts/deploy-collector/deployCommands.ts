/**
 * deploy-collector CLIが実行するgcloudコマンドの組み立て（純粋関数・実行は行わない）。
 *
 * docs/design/data-sync-design.md §4 / docs/design/security-design.md §5.3 準拠。
 *
 * ここで組み立てるのは、**唯一許可された書き込み操作**（収集スクリプトの設置・
 * crontab更新）のみ。実行（子プロセス起動）は `scripts/sync/commandRunner.ts` の
 * `CommandRunner` に委譲し、本ファイルはコマンド・引数の組み立てにのみ専念する
 * （単体テストで実gcloudを使わずに組み立て結果のみを検証できるようにするため）。
 */

import type { GcloudSyncConfig } from "../sync/config";

/** 実行対象コマンド1件分の情報（`scripts/sync/gcloudCommands.ts` と同型）。 */
export interface PlannedCommand {
  /** 進捗ログ・エラーメッセージに使う説明文。 */
  description: string;
  /** 実行コマンド本体（常に `"gcloud"`）。 */
  command: string;
  /** コマンド引数。 */
  args: string[];
}

function projectZoneArgs(config: GcloudSyncConfig): string[] {
  return [`--project=${config.project}`, `--zone=${config.zone}`];
}

/** 専用ディレクトリを作成するコマンド（`mkdir -p`。既存でも失敗しない）。 */
export function buildMkdirCommand(
  config: GcloudSyncConfig,
  remoteDir: string,
): PlannedCommand {
  return {
    description: `専用ディレクトリを作成: ${remoteDir}`,
    command: "gcloud",
    args: [
      "compute",
      "ssh",
      config.instance,
      ...projectZoneArgs(config),
      "--command",
      `mkdir -p '${remoteDir}'`,
    ],
  };
}

/** レンダリング済みcollector.shをローカルからVMへ転送するコマンド（scp）。 */
export function buildScpUploadCommand(
  config: GcloudSyncConfig,
  localScriptPath: string,
  remoteScriptPath: string,
): PlannedCommand {
  return {
    description: `collector.shを転送: ${localScriptPath} → ${remoteScriptPath}`,
    command: "gcloud",
    args: [
      "compute",
      "scp",
      localScriptPath,
      `${config.instance}:${remoteScriptPath}`,
      ...projectZoneArgs(config),
    ],
  };
}

/** 転送したcollector.shに実行権限を付与するコマンド。 */
export function buildChmodCommand(
  config: GcloudSyncConfig,
  remoteScriptPath: string,
): PlannedCommand {
  return {
    description: `実行権限を付与: ${remoteScriptPath}`,
    command: "gcloud",
    args: [
      "compute",
      "ssh",
      config.instance,
      ...projectZoneArgs(config),
      "--command",
      `chmod +x '${remoteScriptPath}'`,
    ],
  };
}

/**
 * 既存crontabを読み取るコマンド。
 * crontab未設定（`crontab -l` が失敗する）場合でも、`|| true` により
 * 呼び出し側は空文字列として扱える（exitCodeは常に0に丸める）。
 *
 * **重要**: この `|| true` は「crontab未設定」という正常系のみを吸収するためのもの。
 * これにより、呼び出し側（deployRunner.ts）が受け取る `exitCode !== 0` は
 * ssh自体の失敗（ネットワーク断・認証エラー等のコマンド失敗）だけを意味する
 * ことが保証される。呼び出し側はこの契約に基づき、`exitCode !== 0` の場合は
 * 「stdoutが空 = crontab未設定」と誤認せず、crontabの書き戻しを中止すること
 * （既存crontabの全消しを防ぐため。docs/design/security-design.md §5参照）。
 */
export function buildReadCrontabCommand(
  config: GcloudSyncConfig,
): PlannedCommand {
  return {
    description: "既存crontabを読み取り",
    command: "gcloud",
    args: [
      "compute",
      "ssh",
      config.instance,
      ...projectZoneArgs(config),
      "--command",
      "crontab -l 2>/dev/null || true",
    ],
  };
}

/**
 * crontabを書き戻すコマンド（`crontab.ts` の `mergeCrontab` で冪等マージ済みの内容を渡す）。
 *
 * シェルの引用符崩れを避けるため、内容はbase64エンコードして渡し、
 * リモート側で `base64 -d | crontab -` によりデコードして書き戻す
 * （改行・特殊文字を含むcrontab内容を安全に転送するため）。
 */
export function buildWriteCrontabCommand(
  config: GcloudSyncConfig,
  newCrontabContent: string,
): PlannedCommand {
  const base64Content = Buffer.from(newCrontabContent, "utf8").toString(
    "base64",
  );
  return {
    description: "crontabを更新（既存行を保持したまま冪等に置換/追加）",
    command: "gcloud",
    args: [
      "compute",
      "ssh",
      config.instance,
      ...projectZoneArgs(config),
      "--command",
      `echo '${base64Content}' | base64 -d | crontab -`,
    ],
  };
}

/**
 * 設置後の検証コマンド（スクリプトの存在・実行権限・crontab行の確認）。
 * 標準出力に `SCRIPT_OK`/`SCRIPT_MISSING`、`CRON_OK`/`CRON_MISSING` を出力させる。
 */
export function buildVerifyCommand(
  config: GcloudSyncConfig,
  remoteScriptPath: string,
): PlannedCommand {
  const script = [
    `test -x '${remoteScriptPath}' && echo SCRIPT_OK || echo SCRIPT_MISSING`,
    `(crontab -l 2>/dev/null | grep -F '${remoteScriptPath}' >/dev/null && echo CRON_OK || echo CRON_MISSING)`,
  ].join(" ; ");
  return {
    description: "設置内容を検証（スクリプト存在・crontab行）",
    command: "gcloud",
    args: [
      "compute",
      "ssh",
      config.instance,
      ...projectZoneArgs(config),
      "--command",
      script,
    ],
  };
}
