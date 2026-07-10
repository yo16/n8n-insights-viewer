import "server-only";

import { InsightsMetricType } from "@/shared/types";
import { jstDayKey } from "@/shared/datetime";
import { buildDailyAxis } from "@/lib/aggregation/timeline";
import type { NormalizedDailyInsightsPoint } from "@/lib/aggregation/insightsNormalization";
import type { TimeSeriesDatum } from "@/components/charts";
import { RANGE_DAYS, type RangeKey } from "./rangeOptions";

/**
 * Insights推移ページ専用の集計→チャートデータ整形ロジック。
 *
 * `src/lib/aggregation` の汎用ヘルパ（`normalizeInsightsToDaily`/`buildDailyAxis`）を
 * この画面固有のフィルタ・欠測ルールに沿って組み合わせる。
 *
 * 欠測 vs 実ゼロの区別（要件 §6.2 / frontend-design.md 画面2）:
 * - 正規化済みデータの中で最も新しい日付（`lastDataDayKey`）以前は「その日は実行が無かった」
 *   という実ゼロ（0）として扱う（insights_by_period に行が無い＝実行数0を意味するため）
 * - `lastDataDayKey` より後（今日まで）は「同期がそこまで届いていない」空白として `null` にする
 *   （TimeSeriesChart の `connectNulls={false}` によりギャップとして描画される）
 */

/** DBクエリ下限（UTC ISO）。UTC/JSTのズレやUTC区切り近似集計の境界を吸収するバッファを持たせる。 */
export function resolveQueryFromIso(range: RangeKey, nowUtcIso: string): string {
  if (range === "all") {
    return "1970-01-01T00:00:00.000Z";
  }
  const bufferedDays = RANGE_DAYS[range] + 1;
  return new Date(new Date(nowUtcIso).getTime() - bufferedDays * 24 * 60 * 60 * 1000).toISOString();
}

/** 期間プリセット（"all" を除く）から、軸の開始日（JST日付キー）を厳密に算出する。 */
function clampSinceDayKeyForRange(range: Exclude<RangeKey, "all">, todayDayKey: string): string {
  const days = RANGE_DAYS[range];
  const todayMs = Date.parse(`${todayDayKey}T00:00:00.000Z`);
  const sinceMs = todayMs - (days - 1) * 24 * 60 * 60 * 1000;
  const d = new Date(sinceMs);
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

export interface InsightsChartModel {
  /** 実行数（成功/失敗）チャート用データ */
  executionsData: TimeSeriesDatum[];
  /** 実行時間（合計）チャート用データ */
  runtimeData: TimeSeriesDatum[];
  /** 絞り込み条件に該当するデータが1件でもあるか */
  hasAnyData: boolean;
  /** 正規化済みデータの末尾日（JST日付キー）。データが無い場合は null */
  lastDataDayKey: string | null;
  /** 今日のJST日付キー（軸の右端） */
  todayDayKey: string;
  /** 表示範囲内にUTC区切り近似集計（day/week由来）の点が1つでも含まれるか */
  hasApproxPoints: boolean;
}

interface DayBucket {
  success: number;
  failure: number;
  runtimeMs: number;
  /** この日の値にUTC区切り近似集計（day/week由来）が含まれるか */
  isApprox: boolean;
}

/**
 * 正規化済み日次ポイント（`normalizeInsightsToDaily` の出力）から、
 * 画面2の2つのチャート（実行数・実行時間）向けの時間軸データを組み立てる。
 *
 * type=0（time_saved_min）は要件 §6.2 により表示対象外のため、呼び出し側で
 * あらかじめ除外しておくか、ここでも無視する（安全のため二重に無視する）。
 */
export function buildInsightsChartData(
  normalized: readonly NormalizedDailyInsightsPoint[],
  range: RangeKey,
  nowUtcIso: string,
): InsightsChartModel {
  const todayDayKey = jstDayKey(nowUtcIso);

  const dayMap = new Map<string, DayBucket>();
  for (const point of normalized) {
    if (point.type === InsightsMetricType.TimeSavedMin) continue;

    const bucket = dayMap.get(point.dayKey) ?? {
      success: 0,
      failure: 0,
      runtimeMs: 0,
      isApprox: false,
    };
    bucket.isApprox = bucket.isApprox || point.isApprox;
    if (point.type === InsightsMetricType.Success) {
      bucket.success += point.value;
    } else if (point.type === InsightsMetricType.Failure) {
      bucket.failure += point.value;
    } else if (point.type === InsightsMetricType.RuntimeMs) {
      bucket.runtimeMs += point.value;
    }
    dayMap.set(point.dayKey, bucket);
  }

  const dayKeys = Array.from(dayMap.keys()).sort();
  const hasAnyData = dayKeys.length > 0;

  if (!hasAnyData) {
    return {
      executionsData: [],
      runtimeData: [],
      hasAnyData: false,
      lastDataDayKey: null,
      todayDayKey,
      hasApproxPoints: false,
    };
  }

  const lastDataDayKey = dayKeys[dayKeys.length - 1];
  const firstDataDayKey = dayKeys[0];
  const sinceDayKey =
    range === "all" ? firstDataDayKey : clampSinceDayKeyForRange(range, todayDayKey);

  const axis = buildDailyAxis(sinceDayKey, nowUtcIso);

  const executionsData: TimeSeriesDatum[] = [];
  const runtimeData: TimeSeriesDatum[] = [];
  let hasApproxPoints = false;

  for (const key of axis) {
    const bucket = dayMap.get(key);
    const withinDataCoverage = key <= lastDataDayKey;
    const isApprox = bucket?.isApprox ?? false;
    if (isApprox) hasApproxPoints = true;

    executionsData.push({
      key,
      isApprox,
      success: bucket ? bucket.success : withinDataCoverage ? 0 : null,
      failure: bucket ? bucket.failure : withinDataCoverage ? 0 : null,
    });
    runtimeData.push({
      key,
      isApprox,
      runtimeMs: bucket ? bucket.runtimeMs : withinDataCoverage ? 0 : null,
    });
  }

  return {
    executionsData,
    runtimeData,
    hasAnyData: true,
    lastDataDayKey,
    todayDayKey,
    hasApproxPoints,
  };
}
