import { DbNotFoundError, getDb } from "@/lib/db/connection";
import { getInsightsTimeSeries } from "@/lib/db/queries/insights";
import { getWorkflowSummaries } from "@/lib/db/queries/workflows";
import { normalizeInsightsToDaily } from "@/lib/aggregation/insightsNormalization";
import { InsightsPeriodUnit } from "@/shared/types";
import { TimeSeriesChart } from "@/components/charts";
import type { ChartSeries } from "@/components/charts";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  DataCoverageNotice,
  InsightsFilterBar,
  WeekApproxFootnote,
} from "@/components/insights";
import { parseRangeParam } from "./rangeOptions";
import { buildInsightsChartData, resolveQueryFromIso } from "./viewModel";
import styles from "./page.module.css";

/**
 * 画面2: Insights推移（`docs/design/frontend-design.md` 画面2）。
 *
 * Server Component。fetch/集計/JST変換・欠測判定はすべてServer側で確定させ、
 * チャート（Client Component）へは確定済みデータのみをpropsで渡す
 * （`docs/design/app-architecture.md` §4 RSC境界）。
 */
export const dynamic = "force-dynamic";

const EXECUTIONS_SERIES: ChartSeries[] = [
  { dataKey: "success", name: "成功", color: "var(--series-success)", type: "area", unit: "count" },
  { dataKey: "failure", name: "失敗", color: "var(--series-failure)", type: "area", unit: "count" },
];

const RUNTIME_SERIES: ChartSeries[] = [
  { dataKey: "runtimeMs", name: "実行時間（合計）", color: "var(--series-runtime)", unit: "ms" },
];

interface InsightsPageProps {
  searchParams: Promise<{ range?: string; workflowId?: string }>;
}

export default async function InsightsPage({ searchParams }: InsightsPageProps) {
  const params = await searchParams;
  const range = parseRangeParam(params.range);
  const workflowId = params.workflowId && params.workflowId.length > 0 ? params.workflowId : undefined;

  let db;
  try {
    db = getDb();
  } catch (err) {
    if (err instanceof DbNotFoundError) {
      return (
        <div className={styles.page}>
          <h1 className={styles.heading}>Insights推移</h1>
          <EmptyState
            title="まだ同期されていません"
            message="npm run sync を実行するか、同期画面から同期を実行してください。"
          />
        </div>
      );
    }
    throw err;
  }

  const nowUtcIso = new Date().toISOString();
  const queryFromIso = resolveQueryFromIso(range, nowUtcIso);

  // insights_by_period は期間により periodUnit（hour/day/week）が異なるため、
  // 3粒度すべてを同一フィルタで取得し、正規化層（normalizeInsightsToDaily）でday基準に統一する
  // （要件 §6.2 / frontend-design.md 画面2）。
  const rawRows = [InsightsPeriodUnit.Hour, InsightsPeriodUnit.Day, InsightsPeriodUnit.Week].flatMap(
    (periodUnit) =>
      getInsightsTimeSeries(db, {
        periodUnit,
        sinceIso: queryFromIso,
        workflowId,
      }),
  );

  const normalized = normalizeInsightsToDaily(rawRows);
  const chartModel = buildInsightsChartData(normalized, range, nowUtcIso);

  const workflows = getWorkflowSummaries(db).map((w) => ({ id: w.workflowId, name: w.name }));

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>Insights推移</h1>

      <InsightsFilterBar range={range} workflowId={workflowId} workflows={workflows} />

      {!chartModel.hasAnyData ? (
        <EmptyState message="条件に一致するデータがありません。期間やワークフローの絞り込みを見直してください。" />
      ) : (
        <>
          {chartModel.lastDataDayKey ? (
            <DataCoverageNotice
              lastDataDayKey={chartModel.lastDataDayKey}
              todayDayKey={chartModel.todayDayKey}
            />
          ) : null}

          <div className={styles.charts}>
            <TimeSeriesChart
              title="実行数（成功/失敗）"
              data={chartModel.executionsData}
              series={EXECUTIONS_SERIES}
              yAxisUnit="count"
              footnote={<WeekApproxFootnote />}
            />
            <TimeSeriesChart
              title="実行時間（合計）"
              data={chartModel.runtimeData}
              series={RUNTIME_SERIES}
              yAxisUnit="ms"
              footnote={<WeekApproxFootnote />}
            />
          </div>
        </>
      )}
    </div>
  );
}
