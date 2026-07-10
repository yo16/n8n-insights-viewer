import path from "path";

import {
  getCurrentJob,
  isJobRunning,
  resetSyncProcessStoreForTests,
  startSyncJob,
  subscribeToSyncJob,
} from "../../../src/lib/sync-process";
import type { SyncJob } from "../../../src/lib/sync-process";

/**
 * src/lib/sync-process/startSyncJob.ts の単体テスト。
 *
 * **実際の `npm run sync`（gcloud経由の本番同期）は絶対に起動しない。**
 * `command`/`args` オプションで、テスト専用のダミースクリプト
 * （`tests/fixtures/sync-process/dummySync.mjs`）に差し替えて検証する。
 */

const DUMMY_SCRIPT = path.join(
  __dirname,
  "..",
  "..",
  "fixtures",
  "sync-process",
  "dummySync.mjs",
);

function waitForFinish(job: SyncJob): Promise<SyncJob> {
  return new Promise((resolve) => {
    if (job.status !== "running") {
      resolve(job);
      return;
    }
    const unsubscribe = subscribeToSyncJob((update) => {
      if (update.type === "finished") {
        unsubscribe();
        resolve(update.job);
      }
    });
  });
}

describe("startSyncJob", () => {
  beforeEach(() => {
    resetSyncProcessStoreForTests();
  });

  afterEach(() => {
    resetSyncProcessStoreForTests();
  });

  it("正常終了するダミープロセスの進捗を蓄積し、successで終了する", async () => {
    const { job, alreadyRunning } = startSyncJob({
      command: process.execPath,
      args: [DUMMY_SCRIPT, "success"],
    });

    expect(alreadyRunning).toBe(false);
    expect(job.status).toBe("running");

    const finished = await waitForFinish(job);

    expect(finished.status).toBe("success");
    expect(finished.exitCode).toBe(0);
    expect(finished.events.map((e) => e.phase)).toEqual([
      "fetch",
      "fetch",
      "__result__",
    ]);
    const resultEvent = finished.events[2];
    expect(resultEvent).toMatchObject({
      phase: "__result__",
      status: "success",
      rowsIngested: { workflow_entity: 3 },
    });
  });

  it("__result__ failedを出すダミープロセスはfailedで終了する", async () => {
    const { job } = startSyncJob({
      command: process.execPath,
      args: [DUMMY_SCRIPT, "failed"],
    });

    const finished = await waitForFinish(job);

    expect(finished.status).toBe("failed");
    expect(finished.error).toBe("dummy failure");
  });

  it("進捗イベントを出さずに異常終了(exit code!=0)した場合もfailedになる", async () => {
    const { job } = startSyncJob({
      command: process.execPath,
      args: [DUMMY_SCRIPT, "crash"],
    });

    const finished = await waitForFinish(job);

    expect(finished.status).toBe("failed");
    expect(finished.exitCode).toBe(3);
    expect(finished.events).toEqual([]);
  });

  it("実行中に再度startSyncJobを呼んでも二重起動せず、既存ジョブを返す", async () => {
    const first = startSyncJob({
      command: process.execPath,
      args: [DUMMY_SCRIPT, "slow"],
    });
    expect(first.alreadyRunning).toBe(false);
    expect(isJobRunning()).toBe(true);

    const second = startSyncJob({
      command: process.execPath,
      args: [DUMMY_SCRIPT, "success"],
    });

    expect(second.alreadyRunning).toBe(true);
    expect(second.job.id).toBe(first.job.id);

    await waitForFinish(first.job);
  });

  it("完了後は新しいジョブを起動できる（二重起動防止は実行中のみ）", async () => {
    const first = startSyncJob({
      command: process.execPath,
      args: [DUMMY_SCRIPT, "success"],
    });
    await waitForFinish(first.job);
    expect(isJobRunning()).toBe(false);

    const second = startSyncJob({
      command: process.execPath,
      args: [DUMMY_SCRIPT, "success"],
    });

    expect(second.alreadyRunning).toBe(false);
    expect(second.job.id).not.toBe(first.job.id);

    await waitForFinish(second.job);
    expect(getCurrentJob()?.id).toBe(second.job.id);
  });

  it("購読中のコールバックには進捗イベントが逐次通知される", async () => {
    const received: string[] = [];
    const unsubscribe = subscribeToSyncJob((update) => {
      if (update.type === "progress") {
        received.push(update.event.phase);
      } else {
        received.push("__finished__");
      }
    });

    const { job } = startSyncJob({
      command: process.execPath,
      args: [DUMMY_SCRIPT, "success"],
    });
    await waitForFinish(job);
    unsubscribe();

    expect(received).toEqual(["fetch", "fetch", "__result__", "__finished__"]);
  });
});
