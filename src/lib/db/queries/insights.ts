import "server-only";

import type Database from "better-sqlite3";

import type { InsightsPeriodUnit, InsightsMetricType } from "../../../shared/types";

/**
 * 画面2（Insights推移）向けクエリ。
 * `docs/design/frontend-design.md` 画面2 / `docs/design/api-design.md` §6 に対応。
 *
 * insights_by_period と insights_metadata を結合し、期間×粒度×（任意）ワークフロー
 * 絞り込みの時系列を返す。粒度混在の正規化・JST変換は集計層の責務であり、
 * ここでは生の periodUnit をそのままフィルタ条件として使う。
 */

/** insights_by_period + insights_metadata 結合後の1行。 */
export interface InsightsTimeSeriesRow {
  periodStart: string;
  periodUnit: InsightsPeriodUnit;
  type: InsightsMetricType;
  value: number;
  workflowId: string | null;
  workflowName: string | null;
}

/** 画面2の絞り込み条件。 */
export interface InsightsTimeSeriesFilter {
  /** 対象の粒度（0=hour/1=day/2=week） */
  periodUnit: InsightsPeriodUnit;
  /** 期間開始の下限（UTC ISO8601, 含む） */
  sinceIso: string;
  /** 期間開始の上限（UTC ISO8601, 含まない）。省略時は上限なし */
  untilIso?: string;
  /** ワークフローIDでの絞り込み。省略時は全ワークフロー */
  workflowId?: string;
}

/**
 * 期間×粒度×（任意）ワークフロー絞り込みの時系列を、periodStart昇順で取得する。
 */
export function getInsightsTimeSeries(
  db: Database.Database,
  filter: InsightsTimeSeriesFilter,
): InsightsTimeSeriesRow[] {
  const sql = `
    SELECT
      ibp.periodStart as periodStart,
      ibp.periodUnit as periodUnit,
      ibp.type as type,
      ibp.value as value,
      im.workflowId as workflowId,
      im.workflowName as workflowName
    FROM insights_by_period ibp
    LEFT JOIN insights_metadata im ON im.metaId = ibp.metaId
    WHERE ibp.periodUnit = @periodUnit
      AND ibp.periodStart >= @sinceIso
      AND (@untilIso IS NULL OR ibp.periodStart < @untilIso)
      AND (@workflowId IS NULL OR im.workflowId = @workflowId)
    ORDER BY ibp.periodStart ASC
  `;

  return db
    .prepare<Record<string, unknown>, InsightsTimeSeriesRow>(sql)
    .all({
      periodUnit: filter.periodUnit,
      sinceIso: filter.sinceIso,
      untilIso: filter.untilIso ?? null,
      workflowId: filter.workflowId ?? null,
    });
}
