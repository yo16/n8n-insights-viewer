import "server-only";

import type Database from "better-sqlite3";

import { InsightsMetricType } from "../../../shared/types";
import type { MachineMetricsRow } from "./machine";

/**
 * 画面1（ダッシュボード）向けクエリ。
 * `docs/design/frontend-design.md` 画面1 / `docs/design/api-design.md` §6 に対応。
 *
 * すべて `prepare().all()/get()` の単発読み取りで、明示トランザクションは張らない
 * （読み取り専用接続のため不要）。
 */

/** insights_by_period を type別に集計した期間サマリ。 */
export interface InsightsSummary {
  /** type=2(success) の合計値 */
  successCount: number;
  /** type=3(failure) の合計値 */
  failureCount: number;
  /** type=1(runtime_ms) の合計値 */
  totalRuntimeMs: number;
  /** successCount + failureCount */
  totalExecutions: number;
  /** totalExecutions が0の場合は null（0除算回避） */
  successRate: number | null;
}

interface InsightsSummaryAggRow {
  type: number;
  total: number | null;
}

/**
 * 指定期間（`periodStart >= sinceIso` かつ `untilIso` 指定時は `periodStart < untilIso`）の
 * insights_by_period を type別に集計し、実行数・成功率・失敗数・総実行時間を返す。
 *
 * 粒度（periodUnit）混在の正規化は集計層（`src/lib/aggregation`）の責務であり、
 * ここでは呼び出し側が指定した periodStart 範囲をそのまま集計する。
 */
export function getInsightsSummary(
  db: Database.Database,
  sinceIso: string,
  untilIso: string | null = null,
): InsightsSummary {
  const sql = `
    SELECT type as type, SUM(value) as total
    FROM insights_by_period
    WHERE periodStart >= @sinceIso
      AND (@untilIso IS NULL OR periodStart < @untilIso)
    GROUP BY type
  `;
  const rows = db
    .prepare<Record<string, unknown>, InsightsSummaryAggRow>(sql)
    .all({ sinceIso, untilIso });

  const totals: Record<number, number> = {};
  for (const row of rows) {
    totals[row.type] = row.total ?? 0;
  }

  const successCount = totals[InsightsMetricType.Success] ?? 0;
  const failureCount = totals[InsightsMetricType.Failure] ?? 0;
  const totalRuntimeMs = totals[InsightsMetricType.RuntimeMs] ?? 0;
  const totalExecutions = successCount + failureCount;

  return {
    successCount,
    failureCount,
    totalRuntimeMs,
    totalExecutions,
    successRate: totalExecutions > 0 ? successCount / totalExecutions : null,
  };
}

/**
 * 最新の machine_metrics を1件取得する（状態評価・ヘッダバッジ用）。
 * データが1件も無い場合は `undefined`。
 */
export function getLatestMachineMetrics(
  db: Database.Database,
): MachineMetricsRow | undefined {
  const sql = `
    SELECT *
    FROM machine_metrics
    ORDER BY ts_utc DESC
    LIMIT 1
  `;
  return db.prepare<[], MachineMetricsRow>(sql).get();
}

/** スパークライン用の系列に絞った machine_metrics の行。 */
export interface MachineMetricsSparklinePoint {
  ts_utc: string;
  mem_available_kb: number | null;
  mem_total_kb: number | null;
  swap_total_kb: number | null;
  swap_free_kb: number | null;
}

/**
 * 直近のスパークライン用に、`sinceIso` 以降の machine_metrics を時系列昇順で取得する。
 */
export function getRecentMachineMetricsSeries(
  db: Database.Database,
  sinceIso: string,
): MachineMetricsSparklinePoint[] {
  const sql = `
    SELECT ts_utc, mem_available_kb, mem_total_kb, swap_total_kb, swap_free_kb
    FROM machine_metrics
    WHERE ts_utc >= @sinceIso
    ORDER BY ts_utc ASC
  `;
  return db
    .prepare<Record<string, unknown>, MachineMetricsSparklinePoint>(sql)
    .all({ sinceIso });
}
