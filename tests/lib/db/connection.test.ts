import fs from "fs";
import os from "os";
import path from "path";

/**
 * src/lib/db/connection.ts の単体テスト
 * (docs/design/api-design.md §2 接続管理)
 *
 * `process.cwd()` をDBが存在しない一時ディレクトリへ差し替え、
 * DB未作成時に `DbNotFoundError` が投げられることを検証する。
 * globalThisシングルトンの挙動（devモードでのキャッシュ）はテスト困難なため対象外とする。
 */
describe("connection", () => {
  let tmpDir: string;
  let cwdSpy: jest.SpyInstance<string, []>;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "n8n-insights-viewer-conn-test-"),
    );
    cwdSpy = jest.spyOn(process, "cwd").mockReturnValue(tmpDir);
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
    jest.resetModules();
  });

  it("DB未作成（親ディレクトリごと無い）の場合はDbNotFoundErrorを投げる", () => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const conn = require("../../../src/lib/db/connection");
    expect(() => conn.getDb()).toThrow(conn.DbNotFoundError);
  });

  it("DB未作成（dataディレクトリはあるがファイルが無い）の場合もDbNotFoundErrorを投げる", () => {
    fs.mkdirSync(path.join(tmpDir, "data"));
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const conn = require("../../../src/lib/db/connection");
    expect(() => conn.getDb()).toThrow(conn.DbNotFoundError);
  });

  it("エラーメッセージに npm run sync の案内を含む", () => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const conn = require("../../../src/lib/db/connection");
    expect(() => conn.getDb()).toThrow(/npm run sync/);
  });

  it("DB_PATHはdataディレクトリ配下のn8n_insights.sqliteを指す", () => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const conn = require("../../../src/lib/db/connection");
    expect(conn.DB_PATH).toBe(path.join(tmpDir, "data", "n8n_insights.sqlite"));
  });
});
