import "server-only";

import type { SyncHistoryRow } from "@/lib/db/queries/sync";

/**
 * 画面6（同期ステータス）専用: 未同期警告の判定。
 *
 * `docs/requirements.md` §4.3: サーバー側の実行明細は7日でpruneされるため、
 * 最終「成功」同期から6日を超えたら「そろそろ同期しないと実行明細に穴が開く」ことを
 * 警告する。判定は最新の履歴行（成功/失敗を問わない）ではなく、
 * **直近の成功履歴**を基準にする（失敗した再試行があっても、実際にデータが
 * 更新されたのは最後に成功した時点のため）。
 */

/** 未同期警告の閾値（日数）。要件§4.3の「6日超」に対応。 */
export const STALE_WARNING_DAYS = 6;

export interface StalenessInfo {
  /** 直近の成功履歴（無ければ `undefined` = 一度も成功していない）。 */
  lastSuccess: SyncHistoryRow | undefined;
  /** 直近の成功同期からの経過日数（小数）。成功実績が無ければ `null`。 */
  daysSinceLastSuccess: number | null;
  /** 警告を表示すべきか（6日超、または一度も成功していない場合に `true`）。 */
  isStale: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * 同期履歴（`started_at` 降順・新しい順を想定）から未同期警告の要否を判定する。
 * @param historyDesc `getSyncHistoryList` 等で取得した履歴一覧（新しい順）
 * @param nowUtcIso 現在時刻（ISO8601, UTC）。テスト容易性のため引数化
 */
export function evaluateStaleness(
  historyDesc: SyncHistoryRow[],
  nowUtcIso: string = new Date().toISOString(),
): StalenessInfo {
  const lastSuccess = historyDesc.find(
    (row) => row.status === "success" && row.finished_at,
  );

  if (!lastSuccess?.finished_at) {
    return { lastSuccess: undefined, daysSinceLastSuccess: null, isStale: true };
  }

  const elapsedMs =
    new Date(nowUtcIso).getTime() - new Date(lastSuccess.finished_at).getTime();
  const daysSinceLastSuccess = elapsedMs / MS_PER_DAY;

  return {
    lastSuccess,
    daysSinceLastSuccess,
    isStale: daysSinceLastSuccess > STALE_WARNING_DAYS,
  };
}
