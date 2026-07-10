import "server-only";

import type { ChildProcess } from "child_process";

import type { SyncJob, SyncJobSubscriber, SyncJobUpdate } from "./types";

/**
 * 同期ジョブの状態を `globalThis` に保持するストア。
 *
 * `docs/design/api-design.md` §3.3 準拠:
 * - devのFast Refreshでモジュールが再評価されてもジョブ状態が失われないよう、
 *   `globalThis` にキャッシュする（`src/lib/db/connection.ts` の `getDb()` と同じ方針）
 * - 実行中ジョブは1つのみ（二重起動防止のため `job.status === "running"` で判定する）
 */

interface SyncProcessGlobalStore {
  job?: SyncJob;
  child?: ChildProcess;
  subscribers: Set<SyncJobSubscriber>;
}

const g = globalThis as unknown as { __syncProcessStore?: SyncProcessGlobalStore };

function getStore(): SyncProcessGlobalStore {
  if (!g.__syncProcessStore) {
    g.__syncProcessStore = { subscribers: new Set() };
  }
  return g.__syncProcessStore;
}

/** 現在保持しているジョブを取得する（実行中とは限らない。直近の結果も含む）。 */
export function getCurrentJob(): SyncJob | undefined {
  return getStore().job;
}

/** 現在のジョブを置き換える（起動時に新規ジョブをセットする用途）。 */
export function setCurrentJob(job: SyncJob): void {
  getStore().job = job;
}

/** 現在の子プロセスハンドルを取得する。 */
export function getCurrentChild(): ChildProcess | undefined {
  return getStore().child;
}

/** 現在の子プロセスハンドルを設定する。 */
export function setCurrentChild(child: ChildProcess | undefined): void {
  getStore().child = child;
}

/** ジョブが実行中かどうか（二重起動防止の判定に使用）。 */
export function isJobRunning(): boolean {
  return getStore().job?.status === "running";
}

/**
 * 進捗更新を購読する。SSE配信（`GET /api/sync/stream`）から利用する。
 * @returns 購読解除関数
 */
export function subscribeToSyncJob(subscriber: SyncJobSubscriber): () => void {
  const store = getStore();
  store.subscribers.add(subscriber);
  return () => {
    store.subscribers.delete(subscriber);
  };
}

/** 購読者全員へ更新を通知する。 */
export function publishSyncJobUpdate(update: SyncJobUpdate): void {
  const store = getStore();
  for (const subscriber of store.subscribers) {
    subscriber(update);
  }
}

/**
 * テスト用: ストアを初期状態にリセットする。
 * `globalThis` ベースのため、テスト間でジョブ状態が漏れないよう明示的に呼び出す。
 */
export function resetSyncProcessStoreForTests(): void {
  g.__syncProcessStore = { subscribers: new Set() };
}
