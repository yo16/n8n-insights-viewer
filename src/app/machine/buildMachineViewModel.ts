import "server-only";

import {
  buildHourlyAxis,
  buildStatusInputFromMachineMetrics,
  computeTrend,
  evaluateStatus,
} from "@/lib/aggregation";
import type { StatusResult, TrendResult } from "@/lib/aggregation";
import type { Thresholds } from "@/lib/config/thresholds";
import type {
  ContainerStatsRow,
  CpuMetricsRow,
  MachineMetricsRow,
  OomEventRow,
} from "@/lib/db/queries/machine";
import { jstHourKey } from "@/shared/datetime";
import type { ChartEventMarker, ChartThreshold, TimeSeriesDatum } from "@/components/charts";

/**
 * 画面5（マシン負荷）用のデータ整形（Server側のみ）。
 * `docs/design/frontend-design.md` 画面5 / `docs/design/api-design.md` §4 に対応。
 *
 * クエリ層が返す生データ（machine_metrics/container_stats/cpu_metrics/oom_events）を、
 * JST時間軸（1時間粒度）に載せたチャート用データへ変換する。
 *
 * ## 独自判断（要件・設計ドキュメントに明記が無いため、本タスクの実装判断として記録）
 *
 * 1. **時間軸の粒度**: 常に1時間粒度（`buildHourlyAxis`）に統一する。machine_metrics
 *    （方式D=cron 1時間毎）に合わせることで、メモリ/スワップ/load/DBサイズ/CPU/コンテナの
 *    全チャートで同じX軸を共有でき比較しやすいため。cpu_metrics（連続データ）は
 *    バケット内平均に丸める。
 * 2. **source='cron'/'spot'の統合ルール**: 同一時間バケットに両方のサンプルが存在する場合は
 *    cronを優先する（cronは毎時定点観測のため代表値として安定しており、spotは同期タイミング
 *    依存の副産物のため）。実装は「バケットに一度cronが入ったら以降のspotで上書きしない」
 *    という単純な規則にする。container_stats（コンテナ別docker stats）も同じ規則を適用する。
 * 3. **CPU使用率(cpu_metrics)のタイムスタンプへの丸め**: GCP Monitoring由来で連続的だが、
 *    他指標と同じ1時間バケットに平均値として載せる（複数サンプルがある場合は算術平均）。
 * 4. **OOMマーカーのスナップ**: `occurred_at_utc` をJST時間バケットキーへスナップし、
 *    同一バケットに複数件ある場合は1本のマーカーにまとめてラベルに件数を表示する。
 * 5. **メモリ/スワップの単位**: KB→bytesへ変換し、チャート共通の`bytes`単位フォーマッタに乗せる
 *    （閾値もbytesへ換算して揃える）。
 * 6. **状態バッジ/データ末尾注記は期間フィルタに依存させない**: `status` と
 *    `latestSampleUtc` は、呼び出し側（`page.tsx`）が`getLatestMachineMetrics`（期間指定なし）
 *    で取得した直近の実測値から算出する。期間タブ（24時間/7日/30日）でrangeスコープされた
 *    `machineMetrics`の末尾を使うと、選択期間内にサンプルが無いだけで「未収集」に見えてしまう
 *    ため、「今の状態」を示すバッジは常に全期間中の最新値を参照する。
 */

export interface ContainerSeriesKey {
  /** 元のコンテナ名（凡例・Tooltip表示用） */
  name: string;
  /** timeline上のCPU%系列のdataKey */
  cpuKey: string;
  /** timeline上のメモリ使用量系列のdataKey */
  memKey: string;
}

export interface MachineViewModel {
  /** JST時間軸（"YYYY-MM-DDTHH"）。全チャート共通 */
  axis: string[];
  /** 全チャート共通のデータ配列（各チャートは必要なdataKeyのみ参照する） */
  timeline: TimeSeriesDatum[];
  /** 期間内に登場したコンテナ名とtimeline上のdataKeyの対応 */
  containerSeriesKeys: ContainerSeriesKey[];
  /** OOM発生マーカー（時間バケットにスナップ済み） */
  oomMarkers: ChartEventMarker[];
  /** 直近の実サンプルから評価した現在の状態 */
  status: StatusResult;
  /** MemAvailableのトレンド（漸減の予兆検知用） */
  memAvailableTrend: TrendResult;
  /** DBサイズのトレンド */
  dbSizeTrend: TrendResult;
  /** 直近のサンプル時刻（UTC ISO8601）。データが無ければnull */
  latestSampleUtc: string | null;
  memoryThresholds: ChartThreshold[];
  swapThresholds: ChartThreshold[];
  dbSizeThresholds: ChartThreshold[];
}

export interface BuildMachineViewModelInput {
  machineMetrics: MachineMetricsRow[];
  containerStats: ContainerStatsRow[];
  cpuMetrics: CpuMetricsRow[];
  oomEvents: OomEventRow[];
  /**
   * 期間フィルタに依存しない直近の実測値（`getLatestMachineMetrics`で取得）。
   * 状態バッジ・データ末尾注記の算出に使う。データが1件も無ければ`undefined`。
   */
  latestMetricsRow: MachineMetricsRow | undefined;
  /** 期間の開始（UTC ISO8601） */
  sinceIso: string;
  /** 「今日」判定の基準となる現在時刻（UTC ISO8601） */
  nowUtcIso: string;
  thresholds: Thresholds;
}

const KB_TO_BYTES = 1024;

/** cron/spot混在時にcronを優先して1件を残す（判断根拠は本ファイル先頭のコメント参照）。 */
function pickPreferCron<T extends { source: string }>(
  existing: T | undefined,
  candidate: T,
): T {
  if (!existing) return candidate;
  if (existing.source === "cron") return existing;
  return candidate;
}

export function buildMachineViewModel(input: BuildMachineViewModelInput): MachineViewModel {
  const {
    machineMetrics,
    containerStats,
    cpuMetrics,
    oomEvents,
    latestMetricsRow,
    sinceIso,
    nowUtcIso,
    thresholds,
  } = input;

  const axis = buildHourlyAxis(jstHourKey(sinceIso), nowUtcIso);

  // machine_metrics: 時間バケットごとにcron優先でマージ
  const mergedMetrics = new Map<string, MachineMetricsRow>();
  for (const row of machineMetrics) {
    const key = jstHourKey(row.ts_utc);
    mergedMetrics.set(key, pickPreferCron(mergedMetrics.get(key), row));
  }

  const memAvailableKbMap = new Map<string, number>();
  const swapUsedKbMap = new Map<string, number>();
  const load1Map = new Map<string, number>();
  const load5Map = new Map<string, number>();
  const load15Map = new Map<string, number>();
  const dbSizeMap = new Map<string, number>();
  const timestampMap = new Map<string, string>();

  for (const [key, row] of mergedMetrics) {
    timestampMap.set(key, row.ts_utc);
    if (row.mem_available_kb !== null) memAvailableKbMap.set(key, row.mem_available_kb);
    if (row.swap_total_kb !== null && row.swap_free_kb !== null) {
      swapUsedKbMap.set(key, row.swap_total_kb - row.swap_free_kb);
    }
    if (row.loadavg_1 !== null) load1Map.set(key, row.loadavg_1);
    if (row.loadavg_5 !== null) load5Map.set(key, row.loadavg_5);
    if (row.loadavg_15 !== null) load15Map.set(key, row.loadavg_15);
    if (row.db_size_bytes !== null) {
      // wal_size_bytesが欠測（null）の場合はdb_size_bytes単体を採用する（0扱いで加算）。
      // WALファイルは常時存在するとは限らず（チェックポイント直後は0バイト/未生成のことがある）、
      // 収集失敗と区別できないため、欠測時にDBサイズ全体を欠測扱いにはしない意図的な仕様。
      dbSizeMap.set(key, row.db_size_bytes + (row.wal_size_bytes ?? 0));
    }
  }

  // cpu_metrics: 同一バケット内は平均を採る（0.0-1.0 -> percentへ変換）
  const cpuSumMap = new Map<string, number>();
  const cpuCountMap = new Map<string, number>();
  for (const row of cpuMetrics) {
    const key = jstHourKey(row.ts_utc);
    cpuSumMap.set(key, (cpuSumMap.get(key) ?? 0) + row.cpu_util);
    cpuCountMap.set(key, (cpuCountMap.get(key) ?? 0) + 1);
  }
  const cpuPercentMap = new Map<string, number>();
  for (const [key, sum] of cpuSumMap) {
    const count = cpuCountMap.get(key) ?? 1;
    cpuPercentMap.set(key, (sum / count) * 100);
  }

  // container_stats: (コンテナ名, 時間バケット) 単位でcron優先マージ
  const containerNamesSet = new Set<string>();
  const mergedContainer = new Map<string, ContainerStatsRow>();
  for (const row of containerStats) {
    containerNamesSet.add(row.container_name);
    const key = `${row.container_name}__${jstHourKey(row.ts_utc)}`;
    mergedContainer.set(key, pickPreferCron(mergedContainer.get(key), row));
  }
  const containerNames = Array.from(containerNamesSet).sort();
  const containerSeriesKeys: ContainerSeriesKey[] = containerNames.map((name, i) => ({
    name,
    cpuKey: `container${i}Cpu`,
    memKey: `container${i}Mem`,
  }));

  const timeline: TimeSeriesDatum[] = axis.map((key) => {
    const datum: TimeSeriesDatum = {
      key,
      timestampUtc: timestampMap.get(key),
      memAvailableBytes: memAvailableKbMap.has(key)
        ? (memAvailableKbMap.get(key) as number) * KB_TO_BYTES
        : null,
      swapUsedBytes: swapUsedKbMap.has(key) ? (swapUsedKbMap.get(key) as number) * KB_TO_BYTES : null,
      loadavg1: load1Map.get(key) ?? null,
      loadavg5: load5Map.get(key) ?? null,
      loadavg15: load15Map.get(key) ?? null,
      dbSizeBytes: dbSizeMap.get(key) ?? null,
      cpuUtilPercent: cpuPercentMap.get(key) ?? null,
    };
    for (const { name, cpuKey, memKey } of containerSeriesKeys) {
      const row = mergedContainer.get(`${name}__${key}`);
      datum[cpuKey] = row?.cpu_pct ?? null;
      datum[memKey] = row?.mem_usage_bytes ?? null;
    }
    return datum;
  });

  // OOMマーカー: 発生時刻を時間バケットへスナップする（軸のkeyと同じ形式に合わせる）
  const oomCountByKey = new Map<string, number>();
  for (const ev of oomEvents) {
    const key = jstHourKey(ev.occurred_at_utc);
    oomCountByKey.set(key, (oomCountByKey.get(key) ?? 0) + 1);
  }
  const oomMarkers: ChartEventMarker[] = Array.from(oomCountByKey.entries()).map(
    ([key, count]) => ({
      key,
      label: count > 1 ? `OOM x${count}` : "OOM",
    }),
  );

  // 状態バッジ・データ末尾注記は期間フィルタに依存しない直近の実測値から評価する
  // （呼び出し側コメント・本ファイル先頭の独自判断6を参照）
  const status = evaluateStatus(buildStatusInputFromMachineMetrics(latestMetricsRow), thresholds);
  const latestSampleUtc = latestMetricsRow?.ts_utc ?? null;

  const memAvailableSamples = axis.map((key) => memAvailableKbMap.get(key) ?? null);
  const dbSizeSamples = axis.map((key) => dbSizeMap.get(key) ?? null);
  const memAvailableTrend = computeTrend(memAvailableSamples, thresholds.trendSampleMin);
  const dbSizeTrend = computeTrend(dbSizeSamples, thresholds.trendSampleMin);

  const memoryThresholds: ChartThreshold[] = [
    { value: thresholds.memAvailableKb.warning * KB_TO_BYTES, level: "warning", label: "注意" },
    { value: thresholds.memAvailableKb.danger * KB_TO_BYTES, level: "danger", label: "危険" },
  ];
  const swapThresholds: ChartThreshold[] = [
    { value: thresholds.swapUsedKb.warning * KB_TO_BYTES, level: "warning", label: "注意" },
    { value: thresholds.swapUsedKb.danger * KB_TO_BYTES, level: "danger", label: "危険" },
  ];
  const dbSizeThresholds: ChartThreshold[] = [
    { value: thresholds.dbSizeBytes.warning, level: "warning", label: "注意" },
  ];

  return {
    axis,
    timeline,
    containerSeriesKeys,
    oomMarkers,
    status,
    memAvailableTrend,
    dbSizeTrend,
    latestSampleUtc,
    memoryThresholds,
    swapThresholds,
    dbSizeThresholds,
  };
}
