/**
 * 蓄積DB `sync_history` テーブルへの同期実行履歴の記録。
 *
 * docs/design/db-design.md §3.2 sync_history 準拠。蓄積DBが無ければ
 * `src/shared/db/init.ts` の `initializeDatabase` で作成する
 * （既存資産の再利用。DDLの二重管理を避ける）。
 */

import fs from "fs";
import path from "path";

import Database from "better-sqlite3";

import { initializeDatabase } from "../../src/shared/db/init";

/** `sync_history.status` の取りうる値。 */
export type SyncHistoryStatus = "running" | "success" | "failed" | "aborted";

/** sync_history更新時に渡すフィールド（started_at/idは除く）。 */
export interface SyncHistoryFinishFields {
  status: SyncHistoryStatus;
  phaseReached?: string;
  integrityOk?: boolean;
  schemaOk?: boolean;
  rowsIngested?: Record<string, number>;
  collectorVersionSeen?: string;
  errorMessage?: string;
  rawCopyDeleted?: boolean;
}

/**
 * 蓄積DBを読み書き可能でオープンし、未初期化なら初期化する。
 * ディレクトリが存在しなければ作成する。
 */
export function openAccumulationDbForWrite(dbPath: string): Database.Database {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  initializeDatabase(db);
  return db;
}

/**
 * `sync_history` に `status='running'` の行を追加し、そのidを返す。
 */
export function startSyncHistory(db: Database.Database): number {
  const startedAt = new Date().toISOString();
  const info = db
    .prepare(
      "INSERT INTO sync_history (started_at, status) VALUES (?, 'running')",
    )
    .run(startedAt);
  return Number(info.lastInsertRowid);
}

/**
 * 開始済みの `sync_history` 行を、最終結果で更新する。
 */
export function finishSyncHistory(
  db: Database.Database,
  id: number,
  fields: SyncHistoryFinishFields,
): void {
  const finishedAt = new Date().toISOString();

  db.prepare(
    `UPDATE sync_history SET
       finished_at = ?,
       status = ?,
       phase_reached = ?,
       integrity_ok = ?,
       schema_ok = ?,
       rows_ingested_json = ?,
       collector_version_seen = ?,
       error_message = ?,
       raw_copy_deleted = ?
     WHERE id = ?`,
  ).run(
    finishedAt,
    fields.status,
    fields.phaseReached ?? null,
    fields.integrityOk === undefined ? null : fields.integrityOk ? 1 : 0,
    fields.schemaOk === undefined ? null : fields.schemaOk ? 1 : 0,
    fields.rowsIngested ? JSON.stringify(fields.rowsIngested) : null,
    fields.collectorVersionSeen ?? null,
    fields.errorMessage ?? null,
    fields.rawCopyDeleted === undefined ? null : fields.rawCopyDeleted ? 1 : 0,
    id,
  );
}
