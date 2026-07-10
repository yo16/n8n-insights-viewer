import "server-only";

import type Database from "better-sqlite3";

/**
 * 画面6（同期ステータス）向けクエリ。
 * `docs/design/frontend-design.md` 画面6 / `docs/design/api-design.md` §6 に対応。
 *
 * sync_history の最新1件・履歴一覧を返す。
 */

/** sync_history（同期実行の履歴）の行。 */
export interface SyncHistoryRow {
  id: number;
  started_at: string;
  finished_at: string | null;
  status: string;
  phase_reached: string | null;
  integrity_ok: number | null;
  schema_ok: number | null;
  rows_ingested_json: string | null;
  collector_version_seen: string | null;
  error_message: string | null;
  raw_copy_deleted: number | null;
}

/**
 * 最新の同期実行履歴を1件取得する（最終同期日時・状態の表示用）。
 * 1件も無い場合は `undefined`（初回同期前）。
 */
export function getLatestSyncHistory(
  db: Database.Database,
): SyncHistoryRow | undefined {
  const sql = `
    SELECT *
    FROM sync_history
    ORDER BY started_at DESC
    LIMIT 1
  `;
  return db.prepare<[], SyncHistoryRow>(sql).get();
}

/**
 * 同期実行履歴一覧を started_at 降順（新しい順）で取得する。
 * @param limit 取得件数上限（既定20）
 */
export function getSyncHistoryList(
  db: Database.Database,
  limit = 20,
): SyncHistoryRow[] {
  const sql = `
    SELECT *
    FROM sync_history
    ORDER BY started_at DESC
    LIMIT @limit
  `;
  return db
    .prepare<Record<string, unknown>, SyncHistoryRow>(sql)
    .all({ limit });
}
