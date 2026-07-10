import fs from "fs";
import os from "os";
import path from "path";

import Database from "better-sqlite3";

import {
  ALL_TABLE_NAMES,
  DB_SCHEMA_VERSION,
} from "../../../src/shared/db/schema";
import {
  checkMigrationStatus,
  getSchemaVersion,
  initializeDatabase,
} from "../../../src/shared/db/init";

/**
 * src/shared/db/init.ts の単体テスト
 * (docs/design/db-design.md §3, §6 DB初期化・マイグレーション)
 *
 * 一時ファイルDBを使い、実際のbetter-sqlite3インスタンスに対して検証する。
 */
describe("initializeDatabase", () => {
  let tmpDir: string;
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "n8n-insights-viewer-db-test-"),
    );
    dbPath = path.join(tmpDir, "test.sqlite");
    db = new Database(dbPath);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("journal_modeがWALに設定される", () => {
    initializeDatabase(db);
    const mode = db.pragma("journal_mode", { simple: true });
    expect(mode).toBe("wal");
  });

  it("11テーブルすべてが作成される", () => {
    initializeDatabase(db);

    const rows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
      )
      .all() as { name: string }[];
    const tableNames = rows.map((r) => r.name);

    for (const expected of ALL_TABLE_NAMES) {
      expect(tableNames).toContain(expected);
    }
    expect(ALL_TABLE_NAMES.length).toBe(11);
  });

  it("schema_metaにdb_schema_versionが記録される", () => {
    initializeDatabase(db);

    const row = db
      .prepare("SELECT value FROM schema_meta WHERE key = 'db_schema_version'")
      .get() as { value: string } | undefined;

    expect(row).toBeDefined();
    expect(Number(row?.value)).toBe(DB_SCHEMA_VERSION);
  });

  it("schema_metaにcreated_atが記録される", () => {
    initializeDatabase(db);

    const row = db
      .prepare("SELECT value FROM schema_meta WHERE key = 'created_at'")
      .get() as { value: string } | undefined;

    expect(row).toBeDefined();
    expect(() => new Date(row!.value).toISOString()).not.toThrow();
  });

  it("複数回呼び出しても冪等（テーブル数・バージョンが変わらない）", () => {
    initializeDatabase(db);
    const firstCreatedAt = db
      .prepare("SELECT value FROM schema_meta WHERE key = 'created_at'")
      .get() as { value: string };

    initializeDatabase(db);
    initializeDatabase(db);

    const rows = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name != 'sqlite_sequence'",
      )
      .all() as { name: string }[];
    expect(rows.length).toBe(ALL_TABLE_NAMES.length);

    const secondCreatedAt = db
      .prepare("SELECT value FROM schema_meta WHERE key = 'created_at'")
      .get() as { value: string };

    // created_atは初回作成時刻を保持し続ける（上書きされない）
    expect(secondCreatedAt.value).toBe(firstCreatedAt.value);

    const version = db
      .prepare("SELECT value FROM schema_meta WHERE key = 'db_schema_version'")
      .get() as { value: string };
    expect(Number(version.value)).toBe(DB_SCHEMA_VERSION);
  });

  it("インデックスも作成される", () => {
    initializeDatabase(db);

    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_%'",
      )
      .all() as { name: string }[];
    const indexNames = indexes.map((i) => i.name);

    expect(indexNames).toContain("idx_ibp_period");
    expect(indexNames).toContain("idx_ibp_meta");
    expect(indexNames).toContain("idx_exec_workflow");
    expect(indexNames).toContain("idx_exec_started");
    expect(indexNames).toContain("idx_exec_status");
    expect(indexNames).toContain("idx_mm_ts");
    expect(indexNames).toContain("idx_cs_ts");
    expect(indexNames).toContain("idx_cpu_ts");
    expect(indexNames).toContain("idx_oom_ts");
    expect(indexNames).toContain("idx_sync_started");
  });

  it("insights_by_periodの主キー制約により重複挿入がエラーになる", () => {
    initializeDatabase(db);

    const insert = db.prepare(
      "INSERT INTO insights_by_period (metaId, type, value, periodUnit, periodStart) VALUES (?, ?, ?, ?, ?)",
    );
    insert.run(1, 0, 100, 1, "2026-07-01T00:00:00.000Z");

    expect(() =>
      insert.run(1, 0, 999, 1, "2026-07-01T00:00:00.000Z"),
    ).toThrow();
  });

  it("machine_metricsのUNIQUE(ts_utc, source)制約が効く", () => {
    initializeDatabase(db);

    const insert = db.prepare(
      "INSERT INTO machine_metrics (ts_utc, source) VALUES (?, ?)",
    );
    insert.run("2026-07-01T00:00:00.000Z", "cron");

    expect(() =>
      insert.run("2026-07-01T00:00:00.000Z", "cron"),
    ).toThrow();

    // sourceが異なれば挿入できる
    expect(() =>
      insert.run("2026-07-01T00:00:00.000Z", "spot"),
    ).not.toThrow();
  });
});

describe("getSchemaVersion", () => {
  let tmpDir: string;
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "n8n-insights-viewer-db-test-"),
    );
    dbPath = path.join(tmpDir, "test.sqlite");
    db = new Database(dbPath);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("未初期化のDBに対してはnullを返す", () => {
    expect(getSchemaVersion(db)).toBeNull();
  });

  it("初期化後は現在のスキーマバージョンを返す", () => {
    initializeDatabase(db);
    expect(getSchemaVersion(db)).toBe(DB_SCHEMA_VERSION);
  });
});

describe("checkMigrationStatus", () => {
  let tmpDir: string;
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "n8n-insights-viewer-db-test-"),
    );
    dbPath = path.join(tmpDir, "test.sqlite");
    db = new Database(dbPath);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("未初期化DBではcurrentVersionがnullでneedsMigrationはfalse", () => {
    const status = checkMigrationStatus(db);
    expect(status.currentVersion).toBeNull();
    expect(status.latestVersion).toBe(DB_SCHEMA_VERSION);
    expect(status.needsMigration).toBe(false);
  });

  it("初期化済みDBでは最新バージョンと一致しneedsMigrationはfalse", () => {
    initializeDatabase(db);
    const status = checkMigrationStatus(db);
    expect(status.currentVersion).toBe(DB_SCHEMA_VERSION);
    expect(status.needsMigration).toBe(false);
  });
});
