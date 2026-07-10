import Link from "next/link";

import { DbNotFoundError, getDb } from "@/lib/db/connection";
import {
  getInsightsSummary,
  getLatestMachineMetrics,
  getRecentMachineMetricsSeries,
  type InsightsSummary,
} from "@/lib/db/queries/dashboard";
import { getMachineMetrics } from "@/lib/db/queries/machine";
import { buildPeriodSummary, type PeriodSummaryResult } from "@/lib/aggregation/summary";
import {
  buildStatusInputFromMachineMetrics,
  evaluateStatus,
} from "@/lib/aggregation/status";
import { computeTrend } from "@/lib/aggregation/trend";
import { loadThresholds } from "@/lib/config/thresholds";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { formatBytes, formatCount, formatDurationMs, formatPercent } from "@/components/charts/format";
import { formatJstDateTime } from "@/shared/datetime";
import { MachineSparklines } from "@/components/dashboard/MachineSparklines";
import type { SparklinePoint } from "@/components/charts/Sparkline";
import { PeriodSummaryCard } from "@/components/dashboard/PeriodSummaryCard";
import type { MetricTileProps } from "@/components/dashboard/MetricTile";
import { TrendIndicator } from "@/components/dashboard/TrendIndicator";
import {
  formatCountDelta,
  formatDurationDelta,
  formatRateDeltaPt,
} from "@/components/dashboard/formatDelta";
import styles from "./page.module.css";

/**
 * 画面1: ダッシュボード（`docs/design/frontend-design.md` 画面1 / `docs/requirements.md` §6.1-1）。
 *
 * 直近7日/30日のサマリ・現在の状態バッジ（判定根拠併記）・トレンド表示・
 * マシン負荷スパークラインをServer Componentとして組み立てる。
 * DB未作成（初回同期前）は `DbNotFoundError` を捕捉し `EmptyState` へフォールバックする
 * （`docs/design/api-design.md` §2.5 / §7）。
 */
export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;
/** トレンド算出に使う直近期間（日数）。OOMの予兆は数日〜数週間単位の漸減として現れるため */
const TREND_WINDOW_DAYS = 14;
/** スパークライン表示に使う直近期間（日数）。「直近のマシン負荷」の意図に合わせた短めの窓 */
const SPARKLINE_WINDOW_DAYS = 3;

function isoDaysAgo(days: number, from: Date): string {
  return new Date(from.getTime() - days * DAY_MS).toISOString();
}

/** 指定日数の当期間・前期間のinsightsサマリ（前期間比込み）を組み立てる。 */
function buildPeriodStats(
  db: ReturnType<typeof getDb>,
  days: number,
  now: Date,
): PeriodSummaryResult {
  const sinceIso = isoDaysAgo(days, now);
  const prevSinceIso = isoDaysAgo(days * 2, now);
  const current: InsightsSummary = getInsightsSummary(db, sinceIso, null);
  const previous: InsightsSummary = getInsightsSummary(db, prevSinceIso, sinceIso);
  return buildPeriodSummary(current, previous);
}

/** PeriodSummaryResult を4つのMetricTile表示用propsへ整形する。 */
function toMetricTiles(summary: PeriodSummaryResult): MetricTileProps[] {
  const { comparison } = summary;
  return [
    {
      label: "総実行数",
      value: formatCount(summary.totalExecutions),
      delta: comparison
        ? formatCountDelta(comparison.totalExecutionsDelta, comparison.totalExecutionsDeltaPct)
        : undefined,
    },
    {
      label: "成功率",
      value: summary.successRate !== null ? formatPercent(summary.successRate * 100) : "-",
      delta: comparison ? formatRateDeltaPt(comparison.successRateDelta) : undefined,
    },
    {
      label: "失敗数",
      value: formatCount(summary.failureCount),
      delta: comparison
        ? formatCountDelta(comparison.failureCountDelta, null)
        : undefined,
    },
    {
      label: "総実行時間",
      value: formatDurationMs(summary.totalRuntimeMs),
      delta: comparison
        ? formatDurationDelta(comparison.totalRuntimeMsDelta, comparison.totalRuntimeMsDeltaPct)
        : undefined,
    },
  ];
}

export default function DashboardPage() {
  let db: ReturnType<typeof getDb>;
  try {
    db = getDb();
  } catch (err) {
    if (err instanceof DbNotFoundError) {
      return (
        <div className={styles.page}>
          <h1 className={styles.title}>ダッシュボード</h1>
          <EmptyState
            title="まだ同期されていません"
            message="npm run sync を実行するか、同期画面から実行してください。"
          >
            <Link href="/sync">同期画面へ</Link>
          </EmptyState>
        </div>
      );
    }
    throw err;
  }

  const now = new Date();
  const thresholds = loadThresholds();

  const summary7d = buildPeriodStats(db, 7, now);
  const summary30d = buildPeriodStats(db, 30, now);

  const latestMetrics = getLatestMachineMetrics(db);
  const statusInput = buildStatusInputFromMachineMetrics(latestMetrics);
  const status = evaluateStatus(statusInput, thresholds);

  const trendSinceIso = isoDaysAgo(TREND_WINDOW_DAYS, now);
  const trendRows = getMachineMetrics(db, { sinceIso: trendSinceIso });
  const memAvailableTrend = computeTrend(
    trendRows.map((r) => r.mem_available_kb),
    thresholds.trendSampleMin,
  );
  const dbSizeTrend = computeTrend(
    trendRows.map((r) =>
      r.db_size_bytes !== null ? r.db_size_bytes + (r.wal_size_bytes ?? 0) : null,
    ),
    thresholds.trendSampleMin,
  );

  const sparklineSinceIso = isoDaysAgo(SPARKLINE_WINDOW_DAYS, now);
  const sparklineRows = getRecentMachineMetricsSeries(db, sparklineSinceIso);
  const memAvailableSeries: SparklinePoint[] = sparklineRows.map((r) => ({
    key: r.ts_utc,
    value: r.mem_available_kb !== null ? r.mem_available_kb * 1024 : null,
    timestampUtc: r.ts_utc,
  }));
  const swapUsedSeries: SparklinePoint[] = sparklineRows.map((r) => ({
    key: r.ts_utc,
    value:
      r.swap_total_kb !== null && r.swap_free_kb !== null
        ? (r.swap_total_kb - r.swap_free_kb) * 1024
        : null,
    timestampUtc: r.ts_utc,
  }));

  const latestMemAvailableLabel =
    latestMetrics?.mem_available_kb != null
      ? formatBytes(latestMetrics.mem_available_kb * 1024)
      : undefined;
  const latestDbSizeLabel =
    latestMetrics?.db_size_bytes != null
      ? formatBytes(latestMetrics.db_size_bytes + (latestMetrics.wal_size_bytes ?? 0))
      : undefined;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>ダッシュボード</h1>
        <StatusBadge status={status.level} reason={status.reasons.join("、") || undefined} />
      </header>

      <section className={styles.summaries}>
        <PeriodSummaryCard title="直近7日" metrics={toMetricTiles(summary7d)} />
        <PeriodSummaryCard title="直近30日" metrics={toMetricTiles(summary30d)} />
      </section>

      <section>
        <Card title="トレンド（直近14日、参考値はサンプル不足を示す）">
          {latestMetrics ? (
            <div className={styles.trendList}>
              <TrendIndicator
                label="MemAvailable"
                currentValueLabel={latestMemAvailableLabel}
                direction={memAvailableTrend.direction}
                isReference={memAvailableTrend.isReference}
                sampleCount={memAvailableTrend.sampleCount}
              />
              <TrendIndicator
                label="DBサイズ"
                currentValueLabel={latestDbSizeLabel}
                direction={dbSizeTrend.direction}
                isReference={dbSizeTrend.isReference}
                sampleCount={dbSizeTrend.sampleCount}
              />
            </div>
          ) : (
            <p className={styles.noData}>
              マシン負荷データがまだ収集されていません（状態評価・トレンドは判定不可）。
            </p>
          )}
        </Card>
      </section>

      <section>
        <Card
          title={
            latestMetrics
              ? `直近のマシン負荷（最終収集: ${formatJstDateTime(latestMetrics.ts_utc)}）`
              : "直近のマシン負荷"
          }
        >
          <MachineSparklines
            memAvailableSeries={memAvailableSeries}
            swapUsedSeries={swapUsedSeries}
          />
        </Card>
      </section>
    </div>
  );
}
