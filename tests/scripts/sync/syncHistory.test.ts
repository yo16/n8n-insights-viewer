import fs from "fs";
import os from "os";
import path from "path";

import {
  finishSyncHistory,
  openAccumulationDbForWrite,
  startSyncHistory,
} from "../../../scripts/sync/syncHistory";

describe("syncHistory", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "n8n-insights-viewer-sync-history-test-"),
    );
    dbPath = path.join(tmpDir, "nested", "n8n_insights.sqlite");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("openAccumulationDbForWriteはディレクトリが無くても作成し、DBを初期化する", () => {
    const db = openAccumulationDbForWrite(dbPath);
    try {
      expect(fs.existsSync(dbPath)).toBe(true);
      const tables = db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sync_history'",
        )
        .get();
      expect(tables).toBeDefined();
    } finally {
      db.close();
    }
  });

  it("startSyncHistoryはstatus='running'の行を追加しidを返す", () => {
    const db = openAccumulationDbForWrite(dbPath);
    try {
      const id = startSyncHistory(db);
      expect(id).toBeGreaterThan(0);

      const row = db
        .prepare("SELECT status, started_at FROM sync_history WHERE id = ?")
        .get(id) as { status: string; started_at: string };
      expect(row.status).toBe("running");
      expect(row.started_at).toBeTruthy();
    } finally {
      db.close();
    }
  });

  it("finishSyncHistoryは指定フィールドで行を更新する", () => {
    const db = openAccumulationDbForWrite(dbPath);
    try {
      const id = startSyncHistory(db);

      finishSyncHistory(db, id, {
        status: "failed",
        phaseReached: "validate",
        integrityOk: true,
        schemaOk: false,
        errorMessage: "schema mismatch",
        rawCopyDeleted: true,
      });

      const row = db
        .prepare("SELECT * FROM sync_history WHERE id = ?")
        .get(id) as Record<string, unknown>;

      expect(row.status).toBe("failed");
      expect(row.phase_reached).toBe("validate");
      expect(row.integrity_ok).toBe(1);
      expect(row.schema_ok).toBe(0);
      expect(row.error_message).toBe("schema mismatch");
      expect(row.raw_copy_deleted).toBe(1);
      expect(row.finished_at).toBeTruthy();
    } finally {
      db.close();
    }
  });

  it("rowsIngestedはJSON文字列として保存される", () => {
    const db = openAccumulationDbForWrite(dbPath);
    try {
      const id = startSyncHistory(db);
      finishSyncHistory(db, id, {
        status: "success",
        rowsIngested: { insights_by_period: 2077, execution_entity: 202 },
      });

      const row = db
        .prepare(
          "SELECT rows_ingested_json FROM sync_history WHERE id = ?",
        )
        .get(id) as { rows_ingested_json: string };

      expect(JSON.parse(row.rows_ingested_json)).toEqual({
        insights_by_period: 2077,
        execution_entity: 202,
      });
    } finally {
      db.close();
    }
  });

  it("既存の蓄積DBに対しても冪等に初期化される(既存データを壊さない)", () => {
    const firstDb = openAccumulationDbForWrite(dbPath);
    const id = startSyncHistory(firstDb);
    firstDb.close();

    const secondDb = openAccumulationDbForWrite(dbPath);
    try {
      const row = secondDb
        .prepare("SELECT id FROM sync_history WHERE id = ?")
        .get(id);
      expect(row).toBeDefined();
    } finally {
      secondDb.close();
    }
  });
});
