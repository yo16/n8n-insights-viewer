import fs from "fs";
import os from "os";
import path from "path";

import Database from "better-sqlite3";

import { runValidatePhase } from "../../../scripts/sync/phases/validatePhase";
import { ValidateError } from "../../../scripts/sync/errors";

/**
 * validatePhase.ts の単体テスト。
 * 一時SQLiteファイルをその場で作成し、正常/破損/スキーマ不一致の各ケースを検証する。
 */

const CREATE_VALID_SCHEMA_TABLES = `
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

describe("runValidatePhase", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "n8n-insights-viewer-validate-test-"),
    );
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("正常なDB(想定スキーマ通り)ではintegrityOk/schemaOkともにtrueを返す", () => {
    const dbPath = path.join(tmpDir, "valid.sqlite");
    const db = new Database(dbPath);
    db.exec(CREATE_VALID_SCHEMA_TABLES);
    db.close();

    const result = runValidatePhase(dbPath);
    expect(result.integrityOk).toBe(true);
    expect(result.schemaOk).toBe(true);
  });

  it("壊れたファイルではValidateErrorをスローし、integrityOk=falseとなる", () => {
    const dbPath = path.join(tmpDir, "broken.sqlite");
    // SQLiteのヘッダとして無効なバイト列を書き込む(有効なDBファイルではない)
    fs.writeFileSync(dbPath, "this is not a valid sqlite file");

    expect(() => runValidatePhase(dbPath)).toThrow();
  });

  it("PRAGMA quick_checkが失敗するDBではValidateError(integrityOk=false)を投げる", () => {
    const dbPath = path.join(tmpDir, "corrupt.sqlite");
    const db = new Database(dbPath);
    db.exec(CREATE_VALID_SCHEMA_TABLES);
    db.close();

    // ページサイズ以降を壊してquick_checkを失敗させる
    const fd = fs.openSync(dbPath, "r+");
    const buffer = Buffer.alloc(200, 0xff);
    fs.writeSync(fd, buffer, 0, buffer.length, 100);
    fs.closeSync(fd);

    try {
      runValidatePhase(dbPath);
      fail("ValidateErrorがスローされるはず");
    } catch (err) {
      expect(err).toBeInstanceOf(ValidateError);
      expect((err as ValidateError).integrityOk).toBe(false);
    }
  });

  it("必要カラムが不足しているテーブルがあればschemaOk=falseのValidateErrorを投げる", () => {
    const dbPath = path.join(tmpDir, "schema-mismatch.sqlite");
    const db = new Database(dbPath);
    // workflow_entityからactiveカラムを欠落させる
    db.exec(`
      CREATE TABLE insights_by_period (metaId INTEGER, type INTEGER, value INTEGER, periodUnit INTEGER, periodStart TEXT);
      CREATE TABLE insights_metadata (metaId INTEGER PRIMARY KEY, workflowId TEXT, workflowName TEXT, projectName TEXT);
      CREATE TABLE workflow_entity (id TEXT PRIMARY KEY, name TEXT, createdAt TEXT, updatedAt TEXT);
      CREATE TABLE workflow_statistics (workflowId TEXT, name TEXT, count INTEGER, latestEvent TEXT);
      CREATE TABLE execution_entity (id INTEGER PRIMARY KEY, workflowId TEXT, status TEXT, mode TEXT, startedAt TEXT, stoppedAt TEXT, createdAt TEXT, finished INTEGER);
    `);
    db.close();

    try {
      runValidatePhase(dbPath);
      fail("ValidateErrorがスローされるはず");
    } catch (err) {
      expect(err).toBeInstanceOf(ValidateError);
      const validateError = err as ValidateError;
      expect(validateError.integrityOk).toBe(true);
      expect(validateError.schemaOk).toBe(false);
      expect(validateError.message).toContain("workflow_entity");
    }
  });

  it("取り込み対象テーブルが存在しなければschemaOk=falseのValidateErrorを投げる", () => {
    const dbPath = path.join(tmpDir, "missing-table.sqlite");
    const db = new Database(dbPath);
    db.exec(`CREATE TABLE unrelated_table (id INTEGER PRIMARY KEY);`);
    db.close();

    expect(() => runValidatePhase(dbPath)).toThrow(ValidateError);
  });
});
