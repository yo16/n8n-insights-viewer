import fs from "fs";
import os from "os";
import path from "path";

import {
  removeExistingRawCopies,
  runFetchPhase,
  type FetchPhaseOptions,
} from "../../../scripts/sync/phases/fetchPhase";
import { FakeCommandRunner } from "./fakes/fakeCommandRunner";
import type { GcloudSyncConfig } from "../../../scripts/sync/config";

/**
 * fetchPhase.ts の単体テスト。
 *
 * 絶対厳守: FakeCommandRunner のみを使用し、実gcloudコマンドは一切実行しない。
 */
describe("runFetchPhase", () => {
  let tmpDir: string;
  let options: FetchPhaseOptions;
  const config: GcloudSyncConfig = {
    project: "test-project",
    zone: "test-zone",
    instance: "test-instance",
    remoteDbPath: "/root/n8n/.n8n/database.sqlite",
    remoteTmpDir: "/tmp/n8n_insights_sync",
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "n8n-insights-viewer-fetch-test-"),
    );
    options = {
      config,
      localRawDir: tmpDir,
      localRawDbPath: path.join(tmpDir, "database.sqlite"),
      localRawWalPath: path.join(tmpDir, "database.sqlite-wal"),
    };
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("成功時: snapshot→scpDb→scpWal→cleanupの順でコマンドを実行する", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "", stderr: "", exitCode: 0 }, // snapshot
      () => {
        // scpの副作用（ローカルファイル作成）をシミュレートする。
        // removeExistingRawCopies()による削除より後（コマンド実行時点）に
        // ファイルを作る必要があるため、事前書き込みではなくハンドラで行う
        fs.writeFileSync(options.localRawDbPath, "dummy-sqlite-bytes");
        return { stdout: "", stderr: "", exitCode: 0 };
      },
      { stdout: "", stderr: "", exitCode: 0 }, // scp wal
      { stdout: "", stderr: "", exitCode: 0 }, // cleanup remote tmp
    ]);

    await runFetchPhase(runner, options);

    expect(runner.calls).toHaveLength(4);
    expect(runner.calls[0].args).toEqual(
      expect.arrayContaining(["compute", "ssh"]),
    );
    expect(runner.calls[1].args).toEqual(
      expect.arrayContaining(["compute", "scp"]),
    );
    expect(runner.calls[1].args.some((a) => a.endsWith("database.sqlite"))).toBe(
      true,
    );
    expect(runner.calls[2].args.some((a) => a.endsWith("database.sqlite-wal"))).toBe(
      true,
    );
    expect(runner.calls[3].args).toEqual(
      expect.arrayContaining(["compute", "ssh"]),
    );
    const cleanupCommandIndex = runner.calls[3].args.indexOf("--command");
    expect(runner.calls[3].args[cleanupCommandIndex + 1]).toBe(
      "sudo rm -rf '/tmp/n8n_insights_sync'",
    );
  });

  it("開始前に残っていた生コピーを削除してから開始する", () => {
    fs.mkdirSync(tmpDir, { recursive: true });
    fs.writeFileSync(options.localRawDbPath, "stale");
    fs.writeFileSync(options.localRawWalPath, "stale-wal");

    removeExistingRawCopies(options);

    expect(fs.existsSync(options.localRawDbPath)).toBe(false);
    expect(fs.existsSync(options.localRawWalPath)).toBe(false);
  });

  it("スナップショット取得コマンドが失敗したら例外を投げる", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "", stderr: "auth error", exitCode: 1 }, // snapshot fails
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 }, // cleanup should still run
    ]);

    await expect(runFetchPhase(runner, options)).rejects.toThrow(
      /スナップショット/,
    );

    // 失敗時でもcleanup(サーバー側/tmp削除)は必ず実行される
    expect(runner.calls).toHaveLength(2);
    expect(runner.calls[1].args).toEqual(
      expect.arrayContaining(["compute", "ssh"]),
    );
  });

  it("scp(database.sqlite)が失敗したら例外を投げ、cleanupは必ず実行する", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "", stderr: "", exitCode: 0 }, // snapshot ok
      { stdout: "", stderr: "network error", exitCode: 1 }, // scp db fails
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 }, // cleanup
    ]);

    await expect(runFetchPhase(runner, options)).rejects.toThrow();

    expect(runner.calls).toHaveLength(3);
    expect(runner.calls[2].args).toEqual(
      expect.arrayContaining(["compute", "ssh"]),
    );
  });

  it("-walの取得が失敗しても致命的エラーにしない(dbファイルがあれば成功)", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "", stderr: "", exitCode: 0 }, // snapshot
      () => {
        fs.writeFileSync(options.localRawDbPath, "dummy-sqlite-bytes");
        return { stdout: "", stderr: "", exitCode: 0 };
      }, // scp db
      { stdout: "", stderr: "no such file", exitCode: 1 }, // scp wal fails
      { stdout: "", stderr: "", exitCode: 0 }, // cleanup
    ]);

    await expect(runFetchPhase(runner, options)).resolves.toBeUndefined();
    expect(runner.calls).toHaveLength(4);
  });

  it("scp成功でもローカルにファイルが存在しなければ例外を投げる", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 },
    ]);

    // localRawDbPathへのファイル作成をシミュレートしない（scpが実際には
    // 動かないテスト環境を想定）

    await expect(runFetchPhase(runner, options)).rejects.toThrow(
      /ファイルが存在しません/,
    );
  });
});
