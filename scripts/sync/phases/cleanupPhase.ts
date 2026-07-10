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
 * 削除対象パス一覧を組み立てる。
 *
 * `-wal` に加え、read-only オープン時にも稀に生成されうる `-shm`
 * （WAL共有メモリファイル）も削除対象に含める（security-design.md §3
 * 「生コピー削除の徹底は最重要」に対する多層防御。**独自判断点**）。
 */
function rawCopyFilePaths(options: CleanupPhaseOptions): string[] {
  return [
    options.localRawDbPath,
    options.localRawWalPath,
    `${options.localRawDbPath}-shm`,
  ];
}

/**
 * 生コピーを削除する。削除完了（またはそもそも存在しなかった）かどうかを返す。
 *
 * @returns 削除完了フラグ（`sync_history.raw_copy_deleted` に記録する値）
 */
export function runCleanupPhase(options: CleanupPhaseOptions): boolean {
  emitPhaseStart("cleanup");

  let deleted = true;
  for (const filePath of rawCopyFilePaths(options)) {
    try {
      if (fs.existsSync(filePath)) {
        fs.rmSync(filePath);
        emitPhaseProgress("cleanup", `生コピーを削除しました: ${filePath}`);
      }

      // rmSyncが例外を投げずに戻っても、実際に消えたことを再確認する
      // （raw_copy_deleted の監査フラグを信頼できる値にするための保険）
      if (fs.existsSync(filePath)) {
        deleted = false;
        emitPhaseProgress(
          "cleanup",
          `生コピーの削除を確認できませんでした（削除後も存在します）: ${filePath}`,
        );
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
