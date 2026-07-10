/**
 * 同期CLIのエントリポイント（`npm run sync`）。
 *
 * docs/design/data-sync-design.md §2/§6 準拠。
 * フェーズの実行は `runner.ts` に委譲し、本ファイルはプロセスの起動・
 * 終了コード制御のみを担う。
 *
 * extract以降のフェーズ（extract/ingest/collect-metrics）は
 * 後続タスク（shu）で実装される。現時点ではfetch→validateまでを実行し、
 * extractフェーズで明示的に停止する骨格。
 */

import { GcloudCommandRunner } from "./commandRunner";
import { logHuman } from "./progress";
import { runSync } from "./runner";

async function main(): Promise<void> {
  logHuman(
    "[sync] 同期CLIを開始します（docs/design/data-sync-design.md 参照）",
  );

  const result = await runSync({
    commandRunner: new GcloudCommandRunner(),
  });

  if (result.status !== "success") {
    logHuman(
      `[sync] 同期は失敗しました（到達フェーズ: ${result.phaseReached}）: ${result.errorMessage ?? "unknown error"}`,
    );
    process.exitCode = 1;
    return;
  }

  logHuman("[sync] 同期が正常に完了しました");
}

main().catch((err: unknown) => {
  logHuman(`[sync] 予期しないエラーで終了しました: ${String(err)}`);
  process.exitCode = 1;
});

export {};
