/**
 * collect-metricsフェーズ（Phase 5）で取得したデータの蓄積DBへのUPSERT。
 *
 * docs/design/db-design.md §3.2 準拠。すべてのテーブルは
 * `UNIQUE` 制約付きの追記UPSERTのため、同じキーで再回収しても重複しない。
 */

import type Database from "better-sqlite3";

/** machine_metrics 1行分（UPSERT対象）。 */
export interface MachineMetricRow {
  tsUtc: string;
  source: string;
  memTotalKb?: number | null;
  memAvailableKb?: number | null;
  memFreeKb?: number | null;
  swapTotalKb?: number | null;
  swapFreeKb?: number | null;
  loadavg1?: number | null;
  loadavg5?: number | null;
  loadavg15?: number | null;
  dbSizeBytes?: number | null;
  walSizeBytes?: number | null;
  rootfsAvailBytes?: number | null;
  collectorVersion?: string | null;
}

/** `machine_metrics` へUPSERTする（キー: ts_utc, source）。 */
export function upsertMachineMetric(
  db: Database.Database,
  row: MachineMetricRow,
): void {
  db.prepare(
    `
    INSERT INTO machine_metrics
      (ts_utc, source, mem_total_kb, mem_available_kb, mem_free_kb,
       swap_total_kb, swap_free_kb, loadavg_1, loadavg_5, loadavg_15,
       db_size_bytes, wal_size_bytes, rootfs_avail_bytes, collector_version)
    VALUES
      (@tsUtc, @source, @memTotalKb, @memAvailableKb, @memFreeKb,
       @swapTotalKb, @swapFreeKb, @loadavg1, @loadavg5, @loadavg15,
       @dbSizeBytes, @walSizeBytes, @rootfsAvailBytes, @collectorVersion)
    ON CONFLICT(ts_utc, source) DO UPDATE SET
      mem_total_kb       = excluded.mem_total_kb,
      mem_available_kb   = excluded.mem_available_kb,
      mem_free_kb        = excluded.mem_free_kb,
      swap_total_kb      = excluded.swap_total_kb,
      swap_free_kb       = excluded.swap_free_kb,
      loadavg_1          = excluded.loadavg_1,
      loadavg_5          = excluded.loadavg_5,
      loadavg_15         = excluded.loadavg_15,
      db_size_bytes      = excluded.db_size_bytes,
      wal_size_bytes     = excluded.wal_size_bytes,
      rootfs_avail_bytes = excluded.rootfs_avail_bytes,
      collector_version  = excluded.collector_version
    `,
  ).run({
    tsUtc: row.tsUtc,
    source: row.source,
    memTotalKb: row.memTotalKb ?? null,
    memAvailableKb: row.memAvailableKb ?? null,
    memFreeKb: row.memFreeKb ?? null,
    swapTotalKb: row.swapTotalKb ?? null,
    swapFreeKb: row.swapFreeKb ?? null,
    loadavg1: row.loadavg1 ?? null,
    loadavg5: row.loadavg5 ?? null,
    loadavg15: row.loadavg15 ?? null,
    dbSizeBytes: row.dbSizeBytes ?? null,
    walSizeBytes: row.walSizeBytes ?? null,
    rootfsAvailBytes: row.rootfsAvailBytes ?? null,
    collectorVersion: row.collectorVersion ?? null,
  });
}

/** container_stats 1行分（UPSERT対象）。 */
export interface ContainerStatRow {
  tsUtc: string;
  source: string;
  containerName: string;
  cpuPct?: number | null;
  memUsageBytes?: number | null;
  memLimitBytes?: number | null;
}

/** `container_stats` へUPSERTする（キー: ts_utc, source, container_name）。 */
export function upsertContainerStat(
  db: Database.Database,
  row: ContainerStatRow,
): void {
  db.prepare(
    `
    INSERT INTO container_stats
      (ts_utc, source, container_name, cpu_pct, mem_usage_bytes, mem_limit_bytes)
    VALUES
      (@tsUtc, @source, @containerName, @cpuPct, @memUsageBytes, @memLimitBytes)
    ON CONFLICT(ts_utc, source, container_name) DO UPDATE SET
      cpu_pct         = excluded.cpu_pct,
      mem_usage_bytes = excluded.mem_usage_bytes,
      mem_limit_bytes = excluded.mem_limit_bytes
    `,
  ).run({
    tsUtc: row.tsUtc,
    source: row.source,
    containerName: row.containerName,
    cpuPct: row.cpuPct ?? null,
    memUsageBytes: row.memUsageBytes ?? null,
    memLimitBytes: row.memLimitBytes ?? null,
  });
}

/** `container_stats` へ複数行をまとめてUPSERTする。 */
export function upsertContainerStats(
  db: Database.Database,
  rows: readonly ContainerStatRow[],
): void {
  for (const row of rows) {
    upsertContainerStat(db, row);
  }
}

/** cpu_metrics 1行分（UPSERT対象）。 */
export interface CpuMetricRow {
  tsUtc: string;
  cpuUtil: number;
}

/** `cpu_metrics` へUPSERTする（キー: ts_utc）。 */
export function upsertCpuMetric(
  db: Database.Database,
  row: CpuMetricRow,
): void {
  db.prepare(
    `
    INSERT INTO cpu_metrics (ts_utc, cpu_util)
    VALUES (@tsUtc, @cpuUtil)
    ON CONFLICT(ts_utc) DO UPDATE SET
      cpu_util = excluded.cpu_util
    `,
  ).run({ tsUtc: row.tsUtc, cpuUtil: row.cpuUtil });
}

/** `cpu_metrics` へ複数行をまとめてUPSERTする。 */
export function upsertCpuMetrics(
  db: Database.Database,
  rows: readonly CpuMetricRow[],
): void {
  for (const row of rows) {
    upsertCpuMetric(db, row);
  }
}

/** oom_events 1行分（UPSERT対象)。 */
export interface OomEventRow {
  occurredAtUtc: string;
  killedProcess: string | null;
  source: string;
  rawLine: string;
  discoveredAt: string;
}

/**
 * `oom_events` へUPSERTする（キー: occurred_at_utc, killed_process）。
 *
 * `discovered_at` はSET句に含めない（**独自判断**: 再回収時に「最初に検知した時刻」を
 * 保持するため。raw_line/sourceは最新の内容で更新してよい）。
 */
export function upsertOomEvent(db: Database.Database, row: OomEventRow): void {
  db.prepare(
    `
    INSERT INTO oom_events
      (occurred_at_utc, killed_process, source, raw_line, discovered_at)
    VALUES
      (@occurredAtUtc, @killedProcess, @source, @rawLine, @discoveredAt)
    ON CONFLICT(occurred_at_utc, killed_process) DO UPDATE SET
      source   = excluded.source,
      raw_line = excluded.raw_line
    `,
  ).run({
    occurredAtUtc: row.occurredAtUtc,
    killedProcess: row.killedProcess,
    source: row.source,
    rawLine: row.rawLine,
    discoveredAt: row.discoveredAt,
  });
}

/** `oom_events` へ複数行をまとめてUPSERTする。 */
export function upsertOomEvents(
  db: Database.Database,
  rows: readonly OomEventRow[],
): void {
  for (const row of rows) {
    upsertOomEvent(db, row);
  }
}
