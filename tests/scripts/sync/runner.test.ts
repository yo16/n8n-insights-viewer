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
 * fetch/validate/extract/ingestは実装済みフェーズとして実際に動かし、
 * collect-metricsフェーズで明示的に停止する骨格であることを検証する。
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
    db.prepare(
      "INSERT INTO insights_by_period (metaId, type, value, periodUnit, periodStart) VALUES (?, ?, ?, ?, ?)",
    ).run(1, 2, 10, 1, "2026-07-01T00:00:00.000Z");
    db.prepare(
      "INSERT INTO insights_metadata (metaId, workflowId, workflowName, projectName) VALUES (?, ?, ?, ?)",
    ).run(1, "wf1", "My Workflow", "Default");
    db.prepare(
      "INSERT INTO workflow_entity (id, name, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)",
    ).run("wf1", "My Workflow", 1, "2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z");
    db.prepare(
      "INSERT INTO workflow_statistics (workflowId, name, count, latestEvent) VALUES (?, ?, ?, ?)",
    ).run("wf1", "production_success", 5, "2026-07-01T00:00:00.000Z");
    db.prepare(
      "INSERT INTO execution_entity (id, workflowId, status, mode, startedAt, stoppedAt, createdAt, finished) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(100, "wf1", "success", "trigger", "2026-07-01T00:00:00.000Z", "2026-07-01T00:01:00.000Z", "2026-07-01T00:00:00.000Z", 1);
    db.close();
  }

  it("fetch→ingestまで成功し、collect-metricsも実行してcleanupまで到達する（collect-metricsはFakeCommandRunnerの既定値=空出力・exitCode0で完走する）", async () => {
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

    expect(result.status).toBe("success");
    expect(result.phaseReached).toBe("cleanup");
    expect(result.errorMessage).toBeUndefined();
    expect(result.rowsIngested).toEqual({
      insights_by_period: 1,
      insights_metadata: 1,
      workflow_entity: 1,
      workflow_statistics: 1,
      execution_entity: 1,
    });

    const accDb = new Database(accumulationDbPath, { readonly: true });
    try {
      const ingestedExecution = accDb
        .prepare("SELECT id, ingestedAt FROM execution_entity WHERE id = 100")
        .get() as Record<string, unknown>;
      expect(ingestedExecution.id).toBe(100);
      expect(ingestedExecution.ingestedAt).toEqual(expect.any(String));
    } finally {
      accDb.close();
    }
  });

  it("collect-metricsで警告が発生しても、同期全体はsuccessのままcleanupまで到達し、警告はsync_historyに記録される", async () => {
    writeValidFixtureDb();

    // fetchの4呼び出しに続けて、collect-metricsの1番目(スポット収集)のみ失敗させる。
    // 以降(oom/scp collector/cpu metrics)はFakeCommandRunnerの既定値(exitCode 0・空stdout)で
    // 問題なく完走する。
    const runner = new FakeCommandRunner([
      { stdout: "", stderr: "", exitCode: 0 }, // snapshot
      () => {
        fs.mkdirSync(path.dirname(rawDbPath), { recursive: true });
        fs.copyFileSync(fixtureDbPath, rawDbPath);
        return { stdout: "", stderr: "", exitCode: 0 };
      }, // scp db
      { stdout: "", stderr: "", exitCode: 0 }, // scp wal
      { stdout: "", stderr: "", exitCode: 0 }, // cleanup remote tmp
      { stdout: "", stderr: "ssh connection refused", exitCode: 1 }, // collect-metrics: spot収集が失敗
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

    // ①result.statusはsuccessのまま
    expect(result.status).toBe("success");
    // ②phaseReachedは"cleanup"（collect-metricsの警告は同期を失敗させない）
    expect(result.phaseReached).toBe("cleanup");
    // ③警告メッセージが記録される
    expect(result.errorMessage).toMatch(/スポット収集に失敗/);

    const db = new Database(accumulationDbPath, { readonly: true });
    try {
      const row = db
        .prepare(
          "SELECT status, phase_reached, error_message FROM sync_history ORDER BY id DESC LIMIT 1",
        )
        .get() as Record<string, unknown>;

      // ④sync_history.statusはsuccess
      expect(row.status).toBe("success");
      expect(row.phase_reached).toBe("cleanup");
      expect(row.error_message).toMatch(/スポット収集に失敗/);
    } finally {
      db.close();
    }
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

  it("sync_historyにsuccess/phase_reached=cleanupと取り込み件数が記録される", async () => {
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
          "SELECT status, phase_reached, integrity_ok, schema_ok, raw_copy_deleted, rows_ingested_json FROM sync_history ORDER BY id DESC LIMIT 1",
        )
        .get() as Record<string, unknown>;

      expect(row.status).toBe("success");
      expect(row.phase_reached).toBe("cleanup");
      expect(row.integrity_ok).toBe(1);
      expect(row.schema_ok).toBe(1);
      expect(row.raw_copy_deleted).toBe(1);
      expect(JSON.parse(row.rows_ingested_json as string)).toEqual({
        insights_by_period: 1,
        insights_metadata: 1,
        workflow_entity: 1,
        workflow_statistics: 1,
        execution_entity: 1,
      });
    } finally {
      db.close();
    }
  });

  it("2回目の同期でもUPSERTのexecution_entityは古い実行明細を消さずに蓄積される", async () => {
    writeValidFixtureDb();
    const runner1 = fakeSuccessfulFetchRunner();

    await runSync({
      commandRunner: runner1,
      fetchOptions: {
        config,
        localRawDir: path.dirname(rawDbPath),
        localRawDbPath: rawDbPath,
        localRawWalPath: rawWalPath,
      },
      accumulationDbPath,
    });

    // 2回目の同期: 本番側でid=100はpruneされ、id=200のみが取得された想定のフィクスチャに差し替え
    fs.rmSync(fixtureDbPath, { force: true });
    const db2 = new Database(fixtureDbPath);
    db2.exec(VALID_SCHEMA_DDL);
    db2.prepare(
      "INSERT INTO insights_by_period (metaId, type, value, periodUnit, periodStart) VALUES (?, ?, ?, ?, ?)",
    ).run(1, 2, 10, 1, "2026-07-01T00:00:00.000Z");
    db2.prepare(
      "INSERT INTO insights_metadata (metaId, workflowId, workflowName, projectName) VALUES (?, ?, ?, ?)",
    ).run(1, "wf1", "My Workflow", "Default");
    db2.prepare(
      "INSERT INTO workflow_entity (id, name, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)",
    ).run("wf1", "My Workflow", 1, "2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z");
    db2.prepare(
      "INSERT INTO workflow_statistics (workflowId, name, count, latestEvent) VALUES (?, ?, ?, ?)",
    ).run("wf1", "production_success", 6, "2026-07-02T00:00:00.000Z");
    db2.prepare(
      "INSERT INTO execution_entity (id, workflowId, status, mode, startedAt, stoppedAt, createdAt, finished) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(200, "wf1", "success", "trigger", "2026-07-02T00:00:00.000Z", "2026-07-02T00:01:00.000Z", "2026-07-02T00:00:00.000Z", 1);
    db2.close();

    const runner2 = fakeSuccessfulFetchRunner();
    await runSync({
      commandRunner: runner2,
      fetchOptions: {
        config,
        localRawDir: path.dirname(rawDbPath),
        localRawDbPath: rawDbPath,
        localRawWalPath: rawWalPath,
      },
      accumulationDbPath,
    });

    const accDb = new Database(accumulationDbPath, { readonly: true });
    try {
      const rows = accDb
        .prepare("SELECT id FROM execution_entity ORDER BY id")
        .all()
        .map((row) => (row as { id: number }).id);
      expect(rows).toEqual([100, 200]);

      // 全置換テーブルのworkflow_statisticsは最新の1件のみに置換されている
      const stats = accDb
        .prepare("SELECT count FROM workflow_statistics WHERE workflowId = 'wf1'")
        .get() as { count: number };
      expect(stats.count).toBe(6);
    } finally {
      accDb.close();
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
