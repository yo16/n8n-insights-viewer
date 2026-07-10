/**
 * Phase 6: cleanup — 生コピー削除（必ず実行）。
 *
 * docs/design/data-sync-design.md §5 Phase 6 / docs/design/security-design.md §3 準拠。
 * fetch〜collect-metricsのどのフェーズで失敗しても、`runner.ts` からtry/finally相当で
 * 必ず呼び出される。生コピー（database.sqlite・-wal）が存在すれば削除する。
 */

import fs from "fs";

import { emitPhaseDone, emitPhaseProgress, emitPhaseStart } from "../progress";

export interface CleanupPhaseOptions {
  localRawDbPath: string;
  localRawWalPath: string;
}

/**
 * 生コピーを削除する。削除完了（またはそもそも存在しなかった）かどうかを返す。
 *
 * @returns 削除完了フラグ（`sync_history.raw_copy_deleted` に記録する値）
 */
export function runCleanupPhase(options: CleanupPhaseOptions): boolean {
  emitPhaseStart("cleanup");

  let deleted = true;
  for (const filePath of [options.localRawDbPath, options.localRawWalPath]) {
    try {
      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath);
        emitPhaseProgress("cleanup", `生コピーを削除しました: ${filePath}`);
      }
    } catch (err) {
      deleted = false;
      const message = err instanceof Error ? err.message : String(err);
      emitPhaseProgress(
        "cleanup",
        `生コピーの削除に失敗しました: ${filePath} (${message})`,
      );
    }
  }

  emitPhaseDone("cleanup");
  return deleted;
}
