import fs from "fs";
import os from "os";
import path from "path";

import Database from "better-sqlite3";

import { runExtractPhase } from "../../../scripts/sync/phases/extractPhase";
import { ExtractError } from "../../../scripts/sync/errors";

/**
 * extractPhase.ts の単体テスト。
 *
 * - ホワイトリスト方式で必要5テーブルのみを読み出すこと
 * - 機微テーブル（credentials_entity）が存在しても一切読み出されないこと
 * - zodスキーマ検証エラー時は ExtractError で中断すること
 */

const CREATE_FULL_SCHEMA = `
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
  finished INTEGER,
  data TEXT
);
CREATE TABLE credentials_entity (
  id TEXT PRIMARY KEY,
  name TEXT,
  data TEXT,
  type TEXT
);
`;

describe("runExtractPhase", () => {
  let tmpDir: string;
  let dbPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "n8n-insights-viewer-extract-test-"),
    );
    dbPath = path.join(tmpDir, "database.sqlite");
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function seedDb(): void {
    const db = new Database(dbPath);
    db.exec(CREATE_FULL_SCHEMA);

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
      "INSERT INTO execution_entity (id, workflowId, status, mode, startedAt, stoppedAt, createdAt, finished, data) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      100,
      "wf1",
      "success",
      "trigger",
      "2026-07-01T00:00:00.000Z",
      "2026-07-01T00:01:00.000Z",
      "2026-07-01T00:00:00.000Z",
      1,
      '{"resultData": {"secret": "should-not-be-extracted"}}',
    );

    db.prepare(
      "INSERT INTO credentials_entity (id, name, data, type) VALUES (?, ?, ?, ?)",
    ).run("cred1", "My Credential", "encrypted-secret-data", "someApi");

    db.close();
  }

  it("必要5テーブルのみをホワイトリスト方式で抽出する", () => {
    seedDb();

    const result = runExtractPhase(dbPath);

    expect(result.insightsByPeriod).toEqual([
      { metaId: 1, type: 2, value: 10, periodUnit: 1, periodStart: "2026-07-01T00:00:00.000Z" },
    ]);
    expect(result.insightsMetadata).toEqual([
      { metaId: 1, workflowId: "wf1", workflowName: "My Workflow", projectName: "Default" },
    ]);
    expect(result.workflowEntity).toEqual([
      {
        id: "wf1",
        name: "My Workflow",
        active: 1,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    ]);
    expect(result.workflowStatistics).toEqual([
      { workflowId: "wf1", name: "production_success", count: 5, latestEvent: "2026-07-01T00:00:00.000Z" },
    ]);
    expect(result.executionEntity).toEqual([
      {
        id: 100,
        workflowId: "wf1",
        status: "success",
        mode: "trigger",
        startedAt: "2026-07-01T00:00:00.000Z",
        stoppedAt: "2026-07-01T00:01:00.000Z",
        createdAt: "2026-07-01T00:00:00.000Z",
        finished: 1,
      },
    ]);
  });

  it("execution_entity.data や credentials_entity 等の機微/不要カラム・テーブルを一切含まない", () => {
    seedDb();

    const result = runExtractPhase(dbPath);
    const executionRow = result.executionEntity[0] as unknown as Record<string, unknown>;

    expect(executionRow.data).toBeUndefined();
    expect(Object.keys(executionRow)).not.toContain("data");
    // 抽出結果の型自体に credentials 由来のフィールドは存在しない
    expect(result).not.toHaveProperty("credentialsEntity");
  });

  it("insights_by_periodのvalueが数値でない(スキーマ不一致)場合はExtractErrorで中断する", () => {
    const db = new Database(dbPath);
    db.exec(CREATE_FULL_SCHEMA);
    // SQLiteの型親和性上、数値変換できない文字列はTEXTのまま保存される
    db.prepare(
      "INSERT INTO insights_by_period (metaId, type, value, periodUnit, periodStart) VALUES (?, ?, ?, ?, ?)",
    ).run(1, 2, "not-a-number", 1, "2026-07-01T00:00:00.000Z");
    db.close();

    expect(() => runExtractPhase(dbPath)).toThrow(ExtractError);
  });

  it("workflow_entityのactiveが0/1以外(スキーマ不一致)であればExtractErrorで中断する", () => {
    const db = new Database(dbPath);
    db.exec(CREATE_FULL_SCHEMA);
    db.prepare(
      "INSERT INTO workflow_entity (id, name, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)",
    ).run("wf1", "My Workflow", 2, "2026-01-01T00:00:00.000Z", "2026-01-02T00:00:00.000Z");
    db.close();

    try {
      runExtractPhase(dbPath);
      fail("ExtractErrorがスローされるはず");
    } catch (err) {
      expect(err).toBeInstanceOf(ExtractError);
      expect((err as ExtractError).message).toContain("workflow_entity");
    }
  });

  it("生コピーが存在しない場合はExtractErrorを投げる", () => {
    const missingPath = path.join(tmpDir, "does-not-exist.sqlite");
    expect(() => runExtractPhase(missingPath)).toThrow(ExtractError);
  });

  it("テーブルは存在するが0行の場合、エラーにならず全テーブル空配列を返す", () => {
    const db = new Database(dbPath);
    db.exec(CREATE_FULL_SCHEMA);
    db.close();

    const result = runExtractPhase(dbPath);

    expect(result.insightsByPeriod).toEqual([]);
    expect(result.insightsMetadata).toEqual([]);
    expect(result.workflowEntity).toEqual([]);
    expect(result.workflowStatistics).toEqual([]);
    expect(result.executionEntity).toEqual([]);
  });
});
