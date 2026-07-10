import "server-only";

import type { InsightsSummary } from "../db/queries";

/**
 * サマリ集計（api-design.md §6 dashboard / 要件 §6.1 画面1）。
 *
 * `queries/dashboard.ts` の `getInsightsSummary` が返す期間サマリ（総実行数・成功率・
 * 失敗数・総実行時間）を、前期間分と組み合わせて「前期間比」を付与する。
 * クエリ層は期間の集計のみを担い、期間同士の比較（前期間比）はこの集計層の責務とする。
 */

export interface PeriodComparison {
  totalExecutionsDelta: number;
  /** 前期間比（比率）。前期間が0件の場合は null（0除算回避） */
  totalExecutionsDeltaPct: number | null;
  totalRuntimeMsDelta: number;
  totalRuntimeMsDeltaPct: number | null;
  failureCountDelta: number;
  /** 成功率の差分（パーセンテージポイント）。どちらかが null の場合は null */
  successRateDelta: number | null;
}

export interface PeriodSummaryResult extends InsightsSummary {
  /** 前期間データが与えられなかった場合は null（比較なし） */
  comparison: PeriodComparison | null;
}

function calcDeltaPct(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / previous;
}

/**
 * 当期間のサマリ（`current`）と前期間のサマリ（`previous`）から、前期間比を含む
 * ダッシュボード表示用サマリを組み立てる。`previous` を省略した場合は比較なし
 * （`comparison: null`）で当期間の値のみを返す。
 */
export function buildPeriodSummary(
  current: InsightsSummary,
  previous?: InsightsSummary | null,
): PeriodSummaryResult {
  if (!previous) {
    return { ...current, comparison: null };
  }

  const comparison: PeriodComparison = {
    totalExecutionsDelta: current.totalExecutions - previous.totalExecutions,
    totalExecutionsDeltaPct: calcDeltaPct(
      current.totalExecutions,
      previous.totalExecutions,
    ),
    totalRuntimeMsDelta: current.totalRuntimeMs - previous.totalRuntimeMs,
    totalRuntimeMsDeltaPct: calcDeltaPct(current.totalRuntimeMs, previous.totalRuntimeMs),
    failureCountDelta: current.failureCount - previous.failureCount,
    successRateDelta:
      current.successRate !== null && previous.successRate !== null
        ? current.successRate - previous.successRate
        : null,
  };

  return { ...current, comparison };
}
