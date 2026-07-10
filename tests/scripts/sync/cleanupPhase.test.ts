import fs from "fs";
import os from "os";
import path from "path";

import { runCleanupPhase } from "../../../scripts/sync/phases/cleanupPhase";
import {
  finishSyncHistory,
  openAccumulationDbForWrite,
  startSyncHistory,
} from "../../../scripts/sync/syncHistory";

/**
 * cleanupPhase.ts の単体テスト。
 *
 * docs/design/data-sync-design.md §5 Phase 6 / docs/design/security-design.md §3 準拠。
 * 生コピー（database.sqlite・-wal・-shm）の削除の確実性と、
 * 削除失敗時に `raw_copy_deleted=0` としてsync_historyへ反映できることを検証する。
 */
describe("runCleanupPhase", () => {
  let tmpDir: string;
  let rawDbPath: string;
  let rawWalPath: string;
  let rawShmPath: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "n8n-insights-viewer-cleanup-test-"),
    );
    rawDbPath = path.join(tmpDir, "database.sqlite");
    rawWalPath = path.join(tmpDir, "database.sqlite-wal");
    rawShmPath = path.join(tmpDir, "database.sqlite-shm");
  });

  afterEach(() => {
    jest.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("database.sqlite / -wal / -shm の3ファイルを実際に削除する", () => {
    fs.writeFileSync(rawDbPath, "dummy-db-content");
    fs.writeFileSync(rawWalPath, "dummy-wal-content");
    fs.writeFileSync(rawShmPath, "dummy-shm-content");

    const deleted = runCleanupPhase({
      localRawDbPath: rawDbPath,
      localRawWalPath: rawWalPath,
    });

    expect(deleted).toBe(true);
    expect(fs.existsSync(rawDbPath)).toBe(false);
    expect(fs.existsSync(rawWalPath)).toBe(false);
    expect(fs.existsSync(rawShmPath)).toBe(false);
  });

  it("ファイルが最初から存在しない場合はdeleted=trueで正常終了する", () => {
    expect(fs.existsSync(rawDbPath)).toBe(false);
    expect(fs.existsSync(rawWalPath)).toBe(false);
    expect(fs.existsSync(rawShmPath)).toBe(false);

    const deleted = runCleanupPhase({
      localRawDbPath: rawDbPath,
      localRawWalPath: rawWalPath,
    });

    expect(deleted).toBe(true);
  });

  it("削除に失敗した場合はdeleted=falseを返す(fs.rmSyncが例外を投げる状況をモックで再現)", () => {
    fs.writeFileSync(rawDbPath, "dummy-db-content");
    // -wal/-shmは作らないため、削除対象はdatabase.sqliteのみ
    // （ロックされたファイル等でrmSyncが失敗する状況を再現する）
    jest.spyOn(fs, "rmSync").mockImplementation(() => {
      throw new Error("EBUSY: resource busy or locked");
    });

    const deleted = runCleanupPhase({
      localRawDbPath: rawDbPath,
      localRawWalPath: rawWalPath,
    });

    expect(deleted).toBe(false);
  });

  it("削除に失敗した場合、その結果がsync_history.raw_copy_deleted=0として記録される", () => {
    fs.writeFileSync(rawDbPath, "dummy-db-content");
    jest.spyOn(fs, "rmSync").mockImplementation(() => {
      throw new Error("EBUSY: resource busy or locked");
    });

    const deleted = runCleanupPhase({
      localRawDbPath: rawDbPath,
      localRawWalPath: rawWalPath,
    });
    expect(deleted).toBe(false);

    jest.restoreAllMocks();

    // runner.ts と同様に、cleanupの戻り値をそのままsync_historyへ記録する経路を検証する
    const accumulationDbPath = path.join(tmpDir, "n8n_insights.sqlite");
    const db = openAccumulationDbForWrite(accumulationDbPath);
    try {
      const id = startSyncHistory(db);
      finishSyncHistory(db, id, {
        status: "failed",
        phaseReached: "cleanup",
        rawCopyDeleted: deleted,
      });

      const row = db
        .prepare("SELECT raw_copy_deleted FROM sync_history WHERE id = ?")
        .get(id) as { raw_copy_deleted: number };

      expect(row.raw_copy_deleted).toBe(0);
    } finally {
      db.close();
    }
  });

  it("削除後もファイルが実際に残っている場合(rmSyncが例外を投げずに戻るケース)はdeleted=falseとなる", () => {
    fs.writeFileSync(rawDbPath, "dummy-db-content");
    // rmSyncが例外を投げずに正常終了したように見えても、実際には削除されていない状況を再現する
    jest.spyOn(fs, "rmSync").mockImplementation(() => undefined);

    const deleted = runCleanupPhase({
      localRawDbPath: rawDbPath,
      localRawWalPath: rawWalPath,
    });

    expect(deleted).toBe(false);
    // モック下では実ファイルへの削除処理は行われていないため、なお存在する
    expect(fs.existsSync(rawDbPath)).toBe(true);
  });
});
