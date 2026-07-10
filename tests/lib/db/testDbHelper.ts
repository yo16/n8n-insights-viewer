import fs from "fs";
import os from "os";
import path from "path";

import Database from "better-sqlite3";

import { initializeDatabase } from "../../../src/shared/db/init";

/**
 * クエリ層のテスト用に、一時ファイルDBへスキーマを適用したインスタンスを生成する。
 * `src/shared/db/init.ts` の `initializeDatabase` を使い、本番と同一のDDLでテーブルを作る。
 */
export function createTestDb(): {
  db: Database.Database;
  cleanup: () => void;
} {
  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "n8n-insights-viewer-query-test-"),
  );
  const dbPath = path.join(tmpDir, "test.sqlite");
  const db = new Database(dbPath);
  initializeDatabase(db);

  const cleanup = () => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  };

  return { db, cleanup };
}
