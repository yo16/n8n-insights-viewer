import "server-only";

import type { SyncProgressEvent } from "../../../scripts/sync/progress";

/**
 * 同期ジョブ（子プロセス）の状態管理に関する型定義。
 *
 * `docs/design/api-design.md` §3 準拠:
 * - 実行中ジョブ・直近の進捗ログは `globalThis` に保持する
 * - 進捗イベントの形式は同期CLI側（`scripts/sync/progress.ts`）が定義するJSON Linesを
 *   そのまま再利用する（BI側で独自に定義し直さない。二重定義によるスキーマ乖離を防ぐ）
 */

/** 同期ジョブ全体としての状態。 */
export type SyncJobStatus = "running" | "success" | "failed" | "aborted";

/** 実行中・実行済みの同期ジョブ1件分の状態。 */
export interface SyncJob {
  /** ジョブ識別子（クライアントがstreamに接続する際の目印。表示以外の用途はない）。 */
  id: string;
  /** ジョブ全体の状態。 */
  status: SyncJobStatus;
  /** 起動時刻（ISO8601）。 */
  startedAt: string;
  /** 終了時刻（ISO8601）。実行中は未設定。 */
  finishedAt?: string;
  /** 子プロセスの終了コード。実行中・起動失敗時は未設定。 */
  exitCode?: number | null;
  /** これまでに受信した進捗イベント（JSON Lines）の履歴。 */
  events: SyncProgressEvent[];
  /** 起動失敗・異常終了時のエラーメッセージ。 */
  error?: string;
}

/** SSE配信のために購読者へ通知する更新イベント。 */
export type SyncJobUpdate =
  | { type: "progress"; event: SyncProgressEvent }
  | { type: "finished"; job: SyncJob };

/** 購読コールバック。 */
export type SyncJobSubscriber = (update: SyncJobUpdate) => void;

export type { SyncProgressEvent };
