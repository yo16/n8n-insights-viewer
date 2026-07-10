import fs from "fs";
import os from "os";
import path from "path";

import Database from "better-sqlite3";

import { runSync } from "../../../scripts/sync/runner";
import { FakeCommandRunner } from "./fakes/fakeCommandRunner";
import type { GcloudSyncConfig } from "../../../scripts/sync/config";

const VALID_SCHEMA_DDL = `
CREATE TABLE insights_by_period (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  metaId INTEGER NOT NULL,
  type INTEGER NOT NULL,
  value INTEGER NOT NULL,
  periodUnit INTEGER NOT NULL,
  periodStart TEXT NOT NULL
);
CREATE TABLE insights_metadata (
  metaId INTEGER PRIMARY KEY,
  workflowId TEXT,
  workflowName TEXT,
  projectName TEXT
);
CREATE TABLE workflow_entity (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  active INTEGER NOT NULL,
  createdAt TEXT,
  updatedAt TEXT
);
CREATE TABLE workflow_statistics (
  workflowId TEXT NOT NULL,
  name TEXT NOT NULL,
  count INTEGER NOT NULL,
  latestEvent TEXT,
  PRIMARY KEY (workflowId, name)
);
CREATE TABLE execution_entity (
  id INTEGER PRIMARY KEY,
  workflowId TEXT,
  status TEXT,
  mode TEXT,
  startedAt TEXT,
  stoppedAt TEXT,
  createdAt TEXT,
  finished INTEGER
);
`;

/**
 * runner.ts（runSync）の結合テスト。
 *
 * 絶対厳守: FakeCommandRunnerのみを使用し、実gcloudコマンドは実行しない。
 * fetch/validateは実装済みフェーズとして実際に動かし、extractフェーズで
 * 明示的に停止する骨格であることを検証する。
 */
describe("runSync", () => {
  let tmpDir: string;
  let rawDbPath: string;
  let rawWalPath: string;
  let fixtureDbPath: string;
  let accumulationDbPath: string;
  const config: GcloudSyncConfig = {
    project: "test-project",
    zone: "test-zone",
    instance: "test-instance",
    remoteDbPath: "/root/n8n/.n8n/database.sqlite",
    remoteTmpDir: "/tmp/n8n_insights_sync",
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "n8n-insights-viewer-runner-test-"),
    );
    rawDbPath = path.join(tmpDir, "raw", "database.sqlite");
    rawWalPath = path.join(tmpDir, "raw", "database.sqlite-wal");
    fixtureDbPath = path.join(tmpDir, "fixture.sqlite");
    accumulationDbPath = path.join(tmpDir, "n8n_insights.sqlite");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /**
   * fetchフェーズを模したFakeCommandRunnerを作る。
   *
   * `removeExistingRawCopies` がfetch開始時に生コピーを削除するため、
   * scp相当のステップ(2番目の呼び出し)実行時に、あらかじめ用意した
   * フィクスチャDBを rawDbPath へコピーする副作用を持たせる
   * （事前に直接rawDbPathへ書き込むと、開始時の削除で消えてしまうため）。
   */
  function fakeSuccessfulFetchRunner(): FakeCommandRunner {
    return new FakeCommandRunner([
      { stdout: "", stderr: "", exitCode: 0 }, // snapshot
      () => {
        fs.mkdirSync(path.dirname(rawDbPath), { recursive: true });
        fs.copyFileSync(fixtureDbPath, rawDbPath);
        return { stdout: "", stderr: "", exitCode: 0 };
      }, // scp db (fixtureDbPathの内容をコピーする副作用)
      { stdout: "", stderr: "", exitCode: 0 }, // scp wal
      { stdout: "", stderr: "", exitCode: 0 }, // cleanup remote tmp
    ]);
  }

  function writeValidFixtureDb(): void {
    const db = new Database(fixtureDbPath);
    db.exec(VALID_SCHEMA_DDL);
    db.close();
  }

  it("fetch→validateまで成功し、extractフェーズで失敗として停止する", async () => {
    writeValidFixtureDb();
    const runner = fakeSuccessfulFetchRunner();

    const result = await runSync({
      commandRunner: runner,
      fetchOptions: {
        config,
        localRawDir: path.dirname(rawDbPath),
        localRawDbPath: rawDbPath,
        localRawWalPath: rawWalPath,
      },
      accumulationDbPath,
    });

    expect(result.status).toBe("failed");
    expect(result.phaseReached).toBe("extract");
    expect(result.errorMessage).toMatch(/extract/);
  });

  it("cleanupフェーズが必ず実行され、生コピーが削除される", async () => {
    writeValidFixtureDb();
    const runner = fakeSuccessfulFetchRunner();

    await runSync({
      commandRunner: runner,
      fetchOptions: {
        config,
        localRawDir: path.dirname(rawDbPath),
        localRawDbPath: rawDbPath,
        localRawWalPath: rawWalPath,
      },
      accumulationDbPath,
    });

    expect(fs.existsSync(rawDbPath)).toBe(false);
  });

  it("sync_historyにfailed/phase_reached=extractが記録される", async () => {
    writeValidFixtureDb();
    const runner = fakeSuccessfulFetchRunner();

    await runSync({
      commandRunner: runner,
      fetchOptions: {
        config,
        localRawDir: path.dirname(rawDbPath),
        localRawDbPath: rawDbPath,
        localRawWalPath: rawWalPath,
      },
      accumulationDbPath,
    });

    const db = new Database(accumulationDbPath, { readonly: true });
    try {
      const row = db
        .prepare(
          "SELECT status, phase_reached, integrity_ok, schema_ok, raw_copy_deleted FROM sync_history ORDER BY id DESC LIMIT 1",
        )
        .get() as Record<string, unknown>;

      expect(row.status).toBe("failed");
      expect(row.phase_reached).toBe("extract");
      expect(row.integrity_ok).toBe(1);
      expect(row.schema_ok).toBe(1);
      expect(row.raw_copy_deleted).toBe(1);
    } finally {
      db.close();
    }
  });

  it("fetch失敗時はphase_reached='fetch'で記録され、cleanupも実行される", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "", stderr: "auth error", exitCode: 1 }, // snapshot fails
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 }, // cleanup
    ]);

    const result = await runSync({
      commandRunner: runner,
      fetchOptions: {
        config,
        localRawDir: path.dirname(rawDbPath),
        localRawDbPath: rawDbPath,
        localRawWalPath: rawWalPath,
      },
      accumulationDbPath,
    });

    expect(result.status).toBe("failed");
    expect(result.phaseReached).toBe("fetch");

    const db = new Database(accumulationDbPath, { readonly: true });
    try {
      const row = db
        .prepare(
          "SELECT phase_reached, raw_copy_deleted FROM sync_history ORDER BY id DESC LIMIT 1",
        )
        .get() as Record<string, unknown>;
      expect(row.phase_reached).toBe("fetch");
      expect(row.raw_copy_deleted).toBe(1);
    } finally {
      db.close();
    }
  });

  it("validate失敗時はphase_reached='validate'・schema_ok=0で記録される", async () => {
    // workflow_entityにactive列が無いスキーマ不一致DBをフィクスチャとして用意
    const badDb = new Database(fixtureDbPath);
    badDb.exec(`
      CREATE TABLE insights_by_period (metaId INTEGER, type INTEGER, value INTEGER, periodUnit INTEGER, periodStart TEXT);
      CREATE TABLE insights_metadata (metaId INTEGER PRIMARY KEY, workflowId TEXT, workflowName TEXT, projectName TEXT);
      CREATE TABLE workflow_entity (id TEXT PRIMARY KEY, name TEXT, createdAt TEXT, updatedAt TEXT);
      CREATE TABLE workflow_statistics (workflowId TEXT, name TEXT, count INTEGER, latestEvent TEXT);
      CREATE TABLE execution_entity (id INTEGER PRIMARY KEY, workflowId TEXT, status TEXT, mode TEXT, startedAt TEXT, stoppedAt TEXT, createdAt TEXT, finished INTEGER);
    `);
    badDb.close();

    const runner = fakeSuccessfulFetchRunner();

    const result = await runSync({
      commandRunner: runner,
      fetchOptions: {
        config,
        localRawDir: path.dirname(rawDbPath),
        localRawDbPath: rawDbPath,
        localRawWalPath: rawWalPath,
      },
      accumulationDbPath,
    });

    expect(result.status).toBe("failed");
    expect(result.phaseReached).toBe("validate");

    const db = new Database(accumulationDbPath, { readonly: true });
    try {
      const row = db
        .prepare(
          "SELECT phase_reached, integrity_ok, schema_ok FROM sync_history ORDER BY id DESC LIMIT 1",
        )
        .get() as Record<string, unknown>;
      expect(row.phase_reached).toBe("validate");
      expect(row.integrity_ok).toBe(1);
      expect(row.schema_ok).toBe(0);
    } finally {
      db.close();
    }

    // validate失敗でも生コピーは削除される
    expect(fs.existsSync(rawDbPath)).toBe(false);
  });
});
