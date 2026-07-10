import "server-only";

import { InsightsPeriodUnit } from "../../shared/types";
import type { InsightsMetricType } from "../../shared/types";
import { jstDayKey } from "../../shared/datetime";

/**
 * 粒度混在の吸収（api-design.md §4.1 / 要件 §6.2）。
 *
 * insights_by_period は期間により periodUnit（0=hour/1=day/2=week）が異なる。
 * - hour粒度が残る期間（直近約90日）は JSTの0時区切りで正しく日次集計できるため、
 *   `jstDayKey` でJST日付に変換する（正確値）
 * - day/week粒度の期間は n8n側がUTC区切りで既に集計済みのため、
 *   JSTの1日とは最大9時間ズレる「近似値」。UTC日付をそのままキーとして使い、
 *   `isApprox: true` を付与する（要件 §6.2）
 *
 * 週粒度（week）は1週間分をまとめて1日分の点として近似表示する
 * （粒度混在吸収の目的は「表示粒度をdayに正規化する」ことであり、週内の日次分解はできないため）。
 */

/** クエリ層（queries/insights.ts の InsightsTimeSeriesRow 等）から入力可能な最小限の行形状。 */
export interface NormalizableInsightsRow {
  periodStart: string;
  periodUnit: InsightsPeriodUnit;
  type: InsightsMetricType;
  value: number;
  workflowId: string | null;
  workflowName: string | null;
}

/** day基準に正規化された1点。 */
export interface NormalizedDailyInsightsPoint {
  /** 正規化後の日付キー（YYYY-MM-DD）。hour由来はJST日付、day/week由来はUTC日付（近似値） */
  dayKey: string;
  /** day/week期間から作られた近似値か（UTC区切りのまま。要件 §6.2） */
  isApprox: boolean;
  type: InsightsMetricType;
  workflowId: string | null;
  workflowName: string | null;
  /** 同一(dayKey, isApprox, type, workflowId)に属する値の合計 */
  value: number;
}

/**
 * UTCのISO8601文字列からUTC基準の日付キー（YYYY-MM-DD）を取り出す。
 * `getUTC*` 系のみを使い、ローカル実行端末のTZに依存しない。
 */
function utcDayKey(utcIso: string): string {
  const d = new Date(utcIso);
  if (Number.isNaN(d.getTime())) {
    throw new Error(`invalid ISO8601 datetime: ${utcIso}`);
  }
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/**
 * insights_by_period の hour/day/week 混在データを、表示粒度（day基準）に正規化する。
 * 同一の正規化キーに複数行がマッピングされた場合は値を合算する（例: hour粒度の複数行が
 * 同一JST日に属する場合）。
 *
 * 出力は dayKey の昇順にソートして返す。
 */
export function normalizeInsightsToDaily(
  rows: readonly NormalizableInsightsRow[],
): NormalizedDailyInsightsPoint[] {
  const buckets = new Map<string, NormalizedDailyInsightsPoint>();

  for (const row of rows) {
    const isHour = row.periodUnit === InsightsPeriodUnit.Hour;
    const dayKey = isHour ? jstDayKey(row.periodStart) : utcDayKey(row.periodStart);
    const isApprox = !isHour;
    const key = `${dayKey}|${isApprox ? "1" : "0"}|${row.type}|${row.workflowId ?? ""}`;

    const existing = buckets.get(key);
    if (existing) {
      existing.value += row.value;
    } else {
      buckets.set(key, {
        dayKey,
        isApprox,
        type: row.type,
        workflowId: row.workflowId,
        workflowName: row.workflowName,
        value: row.value,
      });
    }
  }

  return Array.from(buckets.values()).sort((a, b) => a.dayKey.localeCompare(b.dayKey));
}
