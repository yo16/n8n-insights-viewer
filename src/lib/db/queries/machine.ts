import "server-only";

import type Database from "better-sqlite3";

/**
 * 画面5（マシン負荷）向けクエリ。
 * `docs/design/frontend-design.md` 画面5 / `docs/design/api-design.md` §6 に対応。
 *
 * machine_metrics / container_stats / cpu_metrics / oom_events の期間取得を担う。
 */

/** machine_metrics（メモリ/swap/load/DBサイズ/FS）の行。 */
export interface MachineMetricsRow {
  id: number;
  ts_utc: string;
  source: string;
  mem_total_kb: number | null;
  mem_available_kb: number | null;
  mem_free_kb: number | null;
  swap_total_kb: number | null;
  swap_free_kb: number | null;
  loadavg_1: number | null;
  loadavg_5: number | null;
  loadavg_15: number | null;
  db_size_bytes: number | null;
  wal_size_bytes: number | null;
  rootfs_avail_bytes: number | null;
  collector_version: string | null;
}

/** container_stats（docker stats。コンテナ別）の行。 */
export interface ContainerStatsRow {
  id: number;
  ts_utc: string;
  source: string;
  container_name: string;
  cpu_pct: number | null;
  mem_usage_bytes: number | null;
  mem_limit_bytes: number | null;
}

/** cpu_metrics（GCP Monitoring由来のCPU使用率）の行。 */
export interface CpuMetricsRow {
  id: number;
  ts_utc: string;
  cpu_util: number;
}

/** oom_events（OOMイベント）の行。 */
export interface OomEventRow {
  id: number;
  occurred_at_utc: string;
  killed_process: string | null;
  source: string;
  raw_line: string | null;
  discovered_at: string;
}

/** 期間指定（`sinceIso` <= 対象 < `untilIso`）。`untilIso` 省略時は上限なし。 */
export interface PeriodRange {
  sinceIso: string;
  untilIso?: string | null;
}

function normalizeRange(range: PeriodRange): {
  sinceIso: string;
  untilIso: string | null;
} {
  return { sinceIso: range.sinceIso, untilIso: range.untilIso ?? null };
}

/** 期間内の machine_metrics を ts_utc 昇順で取得する。 */
export function getMachineMetrics(
  db: Database.Database,
  range: PeriodRange,
): MachineMetricsRow[] {
  const { sinceIso, untilIso } = normalizeRange(range);
  const sql = `
    SELECT *
    FROM machine_metrics
    WHERE ts_utc >= @sinceIso
      AND (@untilIso IS NULL OR ts_utc < @untilIso)
    ORDER BY ts_utc ASC
  `;
  return db
    .prepare<Record<string, unknown>, MachineMetricsRow>(sql)
    .all({ sinceIso, untilIso });
}

/** 期間内の container_stats を ts_utc 昇順で取得する。 */
export function getContainerStats(
  db: Database.Database,
  range: PeriodRange,
): ContainerStatsRow[] {
  const { sinceIso, untilIso } = normalizeRange(range);
  const sql = `
    SELECT *
    FROM container_stats
    WHERE ts_utc >= @sinceIso
      AND (@untilIso IS NULL OR ts_utc < @untilIso)
    ORDER BY ts_utc ASC
  `;
  return db
    .prepare<Record<string, unknown>, ContainerStatsRow>(sql)
    .all({ sinceIso, untilIso });
}

/** 期間内の cpu_metrics を ts_utc 昇順で取得する。 */
export function getCpuMetrics(
  db: Database.Database,
  range: PeriodRange,
): CpuMetricsRow[] {
  const { sinceIso, untilIso } = normalizeRange(range);
  const sql = `
    SELECT *
    FROM cpu_metrics
    WHERE ts_utc >= @sinceIso
      AND (@untilIso IS NULL OR ts_utc < @untilIso)
    ORDER BY ts_utc ASC
  `;
  return db
    .prepare<Record<string, unknown>, CpuMetricsRow>(sql)
    .all({ sinceIso, untilIso });
}

/** 期間内の oom_events を occurred_at_utc 昇順で取得する。 */
export function getOomEvents(
  db: Database.Database,
  range: PeriodRange,
): OomEventRow[] {
  const { sinceIso, untilIso } = normalizeRange(range);
  const sql = `
    SELECT *
    FROM oom_events
    WHERE occurred_at_utc >= @sinceIso
      AND (@untilIso IS NULL OR occurred_at_utc < @untilIso)
    ORDER BY occurred_at_utc ASC
  `;
  return db
    .prepare<Record<string, unknown>, OomEventRow>(sql)
    .all({ sinceIso, untilIso });
}
