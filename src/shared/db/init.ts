/**
 * 蓄積DB（閲覧用SQLite）の初期化・スキーマバージョン管理の純粋関数群。
 *
 * Next.js非依存の純粋TS層（`docs/design/app-architecture.md` §3.3）。
 * better-sqlite3の接続確立（ファイルパス指定・read-only/read-writeの区別）は
 * 呼び出し側（`src/lib/db/connection.ts` や `scripts/sync/`）の責務とし、
 * ここでは既に開かれた `Database` インスタンスを受け取って初期化するのみに留める。
 *
 * これによりDB接続生成のポリシー（read-only化・ファイルパス解決等）を
 * Next.js側/CLI側それぞれの都合に委ね、本モジュールはNext.js非依存を保つ。
 */

import type BetterSqlite3 from "better-sqlite3";

import {
  DB_SCHEMA_VERSION,
  SCHEMA_DDL_STATEMENTS,
  SCHEMA_META_KEYS,
} from "./schema";

type Database = BetterSqlite3.Database;

/**
 * DBを初期化する。
 *
 * 実行内容:
 * 1. `PRAGMA journal_mode = WAL` を設定する（同期CLIの書き込みとBIの読み取りが
 *    同時発生しうるため。[db-design.md §1.1](../../../docs/design/db-design.md)）
 * 2. 全DDL（`SCHEMA_DDL_STATEMENTS`）を実行する。
 *    `CREATE TABLE/INDEX IF NOT EXISTS` のため何度実行しても安全（冪等）
 * 3. `schema_meta` に `db_schema_version` / `created_at` が未記録であれば記録する
 *
 * 冪等性: 既にテーブル・メタ情報が存在する状態で呼び出しても、
 * データや既存の `created_at` を上書きしない。
 *
 * @param db 開かれた better-sqlite3 の Database インスタンス（read-writeで開かれていること）
 */
export function initializeDatabase(db: Database): void {
  db.pragma("journal_mode = WAL");

  const applySchema = db.transaction(() => {
    for (const statement of SCHEMA_DDL_STATEMENTS) {
      db.exec(statement);
    }

    recordSchemaMetaIfAbsent(db);
  });

  applySchema();
}

/**
 * `schema_meta` に `db_schema_version` / `created_at` を未記録の場合のみ記録する。
 * 既に記録されている場合は何もしない（冪等・初回作成日時を保持するため）。
 */
function recordSchemaMetaIfAbsent(db: Database): void {
  const upsertIfAbsent = db.prepare(
    "INSERT OR IGNORE INTO schema_meta (key, value) VALUES (?, ?)"
  );

  upsertIfAbsent.run(
    SCHEMA_META_KEYS.DB_SCHEMA_VERSION,
    String(DB_SCHEMA_VERSION)
  );
  upsertIfAbsent.run(SCHEMA_META_KEYS.CREATED_AT, new Date().toISOString());
}

/**
 * `schema_meta` に記録された現在のスキーマバージョンを取得する。
 * 未初期化のDB（`schema_meta` テーブルが存在しない、または行が無い）の場合は `null` を返す。
 */
export function getSchemaVersion(db: Database): number | null {
  const tableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'schema_meta'"
    )
    .get();

  if (!tableExists) {
    return null;
  }

  const row = db
    .prepare("SELECT value FROM schema_meta WHERE key = ?")
    .get(SCHEMA_META_KEYS.DB_SCHEMA_VERSION) as { value: string } | undefined;

  if (!row) {
    return null;
  }

  const version = Number(row.value);
  return Number.isNaN(version) ? null : version;
}

/**
 * 将来の差分マイグレーション適用の骨格。
 *
 * 現状は `DB_SCHEMA_VERSION = 1` のみが存在し、差分マイグレーションは未実装。
 * 将来バージョンが上がった際は、ここに
 * `if (currentVersion === 1) { migrateV1ToV2(db); }` のような分岐を追加し、
 * 最終的に `schema_meta.db_schema_version` を最新値へ更新する実装を追加する
 * （ORM・マイグレーションツールは導入しない方針。
 * [db-design.md §8 設計判断](../../../docs/design/db-design.md)）。
 *
 * @returns 適用前のスキーマバージョン（未初期化なら `null`）と、
 *          適用後の最新バージョン
 */
export function checkMigrationStatus(db: Database): {
  currentVersion: number | null;
  latestVersion: number;
  needsMigration: boolean;
} {
  const currentVersion = getSchemaVersion(db);

  return {
    currentVersion,
    latestVersion: DB_SCHEMA_VERSION,
    needsMigration:
      currentVersion !== null && currentVersion < DB_SCHEMA_VERSION,
  };
}
