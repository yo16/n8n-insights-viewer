/**
 * マシン負荷収集スクリプトの設置CLI（`npm run deploy-collector`）。
 *
 * docs/requirements.md §5.3、docs/design/data-sync-design.md §4 準拠。
 * 実際の設置フローは `deployRunner.ts` に委譲し、本ファイルは
 * プロセスの起動・実I/O（stdin確認・一時ファイル・実gcloud）の配線のみを担う。
 *
 * 使い方:
 *   npm run deploy-collector               # 設置プラン表示 → yes/no確認 → 実行
 *   npm run deploy-collector -- --dry-run  # 設置プランの表示のみ（実行しない）
 */

import fs from "fs";
import os from "os";
import path from "path";
import readline from "readline";

import { GcloudCommandRunner } from "../sync/commandRunner";
import { runDeployCollector } from "./deployRunner";

/** `collector.sh.template` を読み込む。 */
function readTemplate(): string {
  const templatePath = path.join(__dirname, "collector.sh.template");
  return fs.readFileSync(templatePath, "utf8");
}

/** stdinからyes/noの確認を得る。 */
function askConfirmation(): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(
      "\n上記内容でVMへ設置します。よろしいですか？ (yes/no): ",
      (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase() === "yes");
      },
    );
  });
}

/** レンダリング済みスクリプトをローカル一時ファイルへ書き出す（scpのソース）。 */
async function writeLocalTempFile(content: string): Promise<string> {
  const tmpPath = path.join(
    os.tmpdir(),
    `n8n-insights-viewer-collector-${Date.now()}.sh`,
  );
  await fs.promises.writeFile(tmpPath, content, { mode: 0o755 });
  return tmpPath;
}

/** ローカル一時ファイルを削除する。 */
async function removeLocalTempFile(filePath: string): Promise<void> {
  await fs.promises.rm(filePath, { force: true });
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");

  console.log(
    "[deploy-collector] 設置CLIを開始します（docs/design/data-sync-design.md §4 参照）",
  );

  const result = await runDeployCollector({
    runner: new GcloudCommandRunner(),
    templateContent: readTemplate(),
    dryRun,
    confirm: askConfirmation,
    log: (message) => console.log(message),
    writeLocalTempFile,
    removeLocalTempFile,
  });

  if (result.status === "failed") {
    process.exitCode = 1;
  }
}

main().catch((err: unknown) => {
  console.error(
    `[deploy-collector] 予期しないエラーで終了しました: ${String(err)}`,
  );
  process.exitCode = 1;
});

export {};
