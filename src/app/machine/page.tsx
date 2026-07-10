import Link from "next/link";
import type Database from "better-sqlite3";
import { TimeSeriesChart } from "@/components/charts";
import type { ChartSeries } from "@/components/charts";
import { EmptyState } from "@/components/ui/EmptyState";
import { DataCoverageNote } from "@/components/machine/DataCoverageNote";
import { MachineStatusPanel } from "@/components/machine/MachineStatusPanel";
import { RangeFilter, type MachineRange } from "@/components/machine/RangeFilter";
import { loadThresholds } from "@/lib/config/thresholds";
import { DbNotFoundError, getDb } from "@/lib/db/connection";
import { getLatestMachineMetrics } from "@/lib/db/queries/dashboard";
import {
  getCpuMetrics,
  getContainerStats,
  getMachineMetrics,
  getOomEvents,
} from "@/lib/db/queries/machine";
import { buildMachineViewModel } from "./buildMachineViewModel";
import styles from "./page.module.css";

/**
 * 画面5: マシン負荷（docs/design/frontend-design.md 画面5 / 要件 §6.1-5, §6.3）。
 *
 * Server Component。期間フィルタ（24時間/7日/30日）はURL searchParams経由で
 * サーバー再クエリする（app-architecture.md §6）。DB未作成時はEmptyStateを表示する。
 */
export const dynamic = "force-dynamic";

const RANGE_HOURS: Record<MachineRange, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

function parseRange(value: string | string[] | undefined): MachineRange {
  if (value === "24h" || value === "7d" || value === "30d") return value;
  return "7d";
}

/** コンテナ別チャートの色循環（tokens.cssの既存系列色を使い回す。新規トークンは追加しない） */
const CONTAINER_COLORS = [
  "var(--series-memory)",
  "var(--series-cpu)",
  "var(--series-swap)",
  "var(--series-runtime)",
  "var(--series-success)",
  "var(--series-failure)",
];

export interface MachinePageProps {
  searchParams: Promise<{ range?: string | string[] }>;
}

export default async function MachinePage({ searchParams }: MachinePageProps) {
  const params = await searchParams;
  const range = parseRange(params.range);

  let db: Database.Database;
  try {
    db = getDb();
  } catch (err) {
    if (err instanceof DbNotFoundError) {
      return (
        <EmptyState
          title="マシン負荷"
          message="まだ同期されていません。npm run sync を実行するか、同期画面から実行してください。"
        >
          <Link href="/sync">同期画面へ</Link>
        </EmptyState>
      );
    }
    throw err;
  }

  const nowUtcIso = new Date().toISOString();
  const sinceIso = new Date(
    new Date(nowUtcIso).getTime() - RANGE_HOURS[range] * 60 * 60 * 1000,
  ).toISOString();

  const machineMetrics = getMachineMetrics(db, { sinceIso });
  const containerStats = getContainerStats(db, { sinceIso });
  const cpuMetrics = getCpuMetrics(db, { sinceIso });
  const oomEvents = getOomEvents(db, { sinceIso });
  const thresholds = loadThresholds();
  // 状態バッジ・データ末尾注記は期間タブに左右されない「今の実測値」を示す必要があるため、
  // 期間フィルタ（sinceIso）を掛けない getLatestMachineMetrics から別途取得する
  // （buildMachineViewModel.ts 先頭コメントの独自判断6を参照）。
  const latestMetricsRow = getLatestMachineMetrics(db);

  const viewModel = buildMachineViewModel({
    machineMetrics,
    containerStats,
    cpuMetrics,
    oomEvents,
    latestMetricsRow,
    sinceIso,
    nowUtcIso,
    thresholds,
  });

  const hasAnyData = viewModel.timeline.some(
    (d) =>
      d.memAvailableBytes !== null ||
      d.swapUsedBytes !== null ||
      d.dbSizeBytes !== null ||
      d.cpuUtilPercent !== null ||
      d.loadavg1 !== null,
  );

  const loadSeries: ChartSeries[] = [
    { dataKey: "loadavg1", name: "1分平均", color: "var(--series-cpu)", unit: "none" },
    {
      dataKey: "loadavg5",
      name: "5分平均",
      color: "var(--series-memory)",
      unit: "none",
      strokeDasharray: "4 2",
    },
    {
      dataKey: "loadavg15",
      name: "15分平均",
      color: "var(--series-swap)",
      unit: "none",
      strokeDasharray: "2 2",
    },
  ];

  const containerCpuSeries: ChartSeries[] = viewModel.containerSeriesKeys.map((c, i) => ({
    dataKey: c.cpuKey,
    name: c.name,
    color: CONTAINER_COLORS[i % CONTAINER_COLORS.length],
    unit: "percent",
  }));

  const containerMemSeries: ChartSeries[] = viewModel.containerSeriesKeys.map((c, i) => ({
    dataKey: c.memKey,
    name: c.name,
    color: CONTAINER_COLORS[i % CONTAINER_COLORS.length],
    unit: "bytes",
  }));

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <h1 className={styles.heading}>マシン負荷</h1>
        <RangeFilter current={range} />
      </div>

      <MachineStatusPanel
        status={viewModel.status}
        memAvailableTrend={viewModel.memAvailableTrend}
        dbSizeTrend={viewModel.dbSizeTrend}
      />

      <DataCoverageNote
        latestSampleUtc={viewModel.latestSampleUtc}
        inRangeHasData={hasAnyData}
      />

      {!hasAnyData ? (
        <EmptyState message="この期間に該当するマシン負荷データがありません。" />
      ) : (
        <div className={styles.charts}>
          <TimeSeriesChart
            title="メモリ（MemAvailable）"
            data={viewModel.timeline}
            series={[
              {
                dataKey: "memAvailableBytes",
                name: "MemAvailable",
                color: "var(--series-memory)",
                unit: "bytes",
                type: "area",
              },
            ]}
            thresholds={viewModel.memoryThresholds}
            eventMarkers={viewModel.oomMarkers}
            yAxisUnit="bytes"
          />

          <TimeSeriesChart
            title="スワップ使用量"
            data={viewModel.timeline}
            series={[
              {
                dataKey: "swapUsedBytes",
                name: "スワップ使用量",
                color: "var(--series-swap)",
                unit: "bytes",
                type: "area",
              },
            ]}
            thresholds={viewModel.swapThresholds}
            yAxisUnit="bytes"
          />

          <TimeSeriesChart
            title="load average"
            data={viewModel.timeline}
            series={loadSeries}
            yAxisUnit="none"
          />

          <TimeSeriesChart
            title="CPU使用率"
            data={viewModel.timeline}
            series={[
              {
                dataKey: "cpuUtilPercent",
                name: "CPU使用率",
                color: "var(--series-cpu)",
                unit: "percent",
              },
            ]}
            yAxisUnit="percent"
          />

          <TimeSeriesChart
            title="database.sqlite サイズ"
            data={viewModel.timeline}
            series={[
              {
                dataKey: "dbSizeBytes",
                name: "DBサイズ",
                color: "var(--series-runtime)",
                unit: "bytes",
              },
            ]}
            thresholds={viewModel.dbSizeThresholds}
            yAxisUnit="bytes"
          />

          {viewModel.containerSeriesKeys.length > 0 ? (
            <>
              <TimeSeriesChart
                title="コンテナ別CPU使用率"
                data={viewModel.timeline}
                series={containerCpuSeries}
                yAxisUnit="percent"
              />
              <TimeSeriesChart
                title="コンテナ別メモリ使用量"
                data={viewModel.timeline}
                series={containerMemSeries}
                yAxisUnit="bytes"
              />
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
