/**
 * collect-metricsフェーズ（Phase 5）の各種出力パース（純粋関数）。
 *
 * docs/design/data-sync-design.md §5 Phase 5 / §3.2 出力形式 準拠。
 * すべて文字列 → 構造化データへの変換のみを行い、副作用（DB書き込み・
 * コマンド実行）は一切持たない。壊れた行・想定外のフォーマットは
 * 例外を投げず `null`（または配列からスキップ）で表現し、
 * 呼び出し側（collectMetricsPhase.ts）が個別に警告として扱えるようにする。
 */

import { z } from "zod";

/** `/proc/meminfo` のパース結果（kB単位、原文のまま）。 */
export interface MeminfoValues {
  memTotalKb: number | null;
  memAvailableKb: number | null;
  memFreeKb: number | null;
  swapTotalKb: number | null;
  swapFreeKb: number | null;
}

/**
 * `/proc/meminfo` をパースする。
 * 例: "MemTotal:        977000 kB"
 * 想定する行が見つからない項目は `null` にする（壊れた入力を許容）。
 */
export function parseMeminfo(text: string): MeminfoValues {
  const values: Record<string, number> = {};
  const lineRe = /^(\w+):\s+(\d+)\s*kB\s*$/;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const m = lineRe.exec(line);
    if (!m) continue;
    values[m[1]] = Number(m[2]);
  }
  return {
    memTotalKb: values.MemTotal ?? null,
    memAvailableKb: values.MemAvailable ?? null,
    memFreeKb: values.MemFree ?? null,
    swapTotalKb: values.SwapTotal ?? null,
    swapFreeKb: values.SwapFree ?? null,
  };
}

/** `/proc/loadavg` のパース結果。 */
export interface LoadavgValues {
  loadavg1: number | null;
  loadavg5: number | null;
  loadavg15: number | null;
}

/**
 * `/proc/loadavg` をパースする。
 * 例: "0.42 0.55 0.60 1/234 5678"
 * 先頭3値を取得できなければ全て `null` にする。
 */
export function parseLoadavg(text: string): LoadavgValues {
  const trimmed = text.trim();
  if (!trimmed) {
    return { loadavg1: null, loadavg5: null, loadavg15: null };
  }
  const tokens = trimmed.split(/\s+/);
  const [a, b, c] = tokens;
  const l1 = Number(a);
  const l5 = Number(b);
  const l15 = Number(c);
  if ([l1, l5, l15].some((v) => Number.isNaN(v))) {
    return { loadavg1: null, loadavg5: null, loadavg15: null };
  }
  return { loadavg1: l1, loadavg5: l5, loadavg15: l15 };
}

/** `docker stats --no-stream` 1コンテナ分のパース結果。 */
export interface DockerStatsRow {
  name: string;
  cpuPct: number | null;
  memUsageBytes: number | null;
  memLimitBytes: number | null;
}

/** バイト単位のサフィックス（docker stats形式: B/kB/KiB/MiB/GiB/TiB 等）。 */
const BYTE_UNITS: Record<string, number> = {
  b: 1,
  kb: 1000,
  kib: 1024,
  mb: 1000 ** 2,
  mib: 1024 ** 2,
  gb: 1000 ** 3,
  gib: 1024 ** 3,
  tb: 1000 ** 4,
  tib: 1024 ** 4,
};

/**
 * "210MiB" のようなdocker stats形式のサイズ文字列をバイト数へ変換する。
 * パースできなければ `null` を返す。
 */
function parseByteSize(text: string): number | null {
  const trimmed = text.trim();
  const m = /^([\d.]+)\s*([a-zA-Z]+)$/.exec(trimmed);
  if (!m) return null;
  const value = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (Number.isNaN(value) || !(unit in BYTE_UNITS)) return null;
  return Math.round(value * BYTE_UNITS[unit]);
}

/**
 * `docker stats --no-stream --format '{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}'`
 * の出力（複数行）をパースする。1行 = 1コンテナ。
 * タブ区切りでない行・数値変換に失敗した行はスキップする。
 */
export function parseDockerStats(text: string): DockerStatsRow[] {
  const rows: DockerStatsRow[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const parts = line.split("\t");
    if (parts.length !== 3) continue;

    const [name, cpuRaw, memRaw] = parts;
    if (!name) continue;

    const cpuMatch = /^([\d.]+)%$/.exec(cpuRaw.trim());
    const cpuPct = cpuMatch ? Number(cpuMatch[1]) : null;

    const memParts = memRaw.split("/").map((s) => s.trim());
    const memUsageBytes =
      memParts.length === 2 ? parseByteSize(memParts[0]) : null;
    const memLimitBytes =
      memParts.length === 2 ? parseByteSize(memParts[1]) : null;

    rows.push({ name, cpuPct, memUsageBytes, memLimitBytes });
  }
  return rows;
}

/** スポット収集（方式B）の1コマンド分の出力全体のパース結果。 */
export interface SpotMetrics {
  meminfo: MeminfoValues;
  loadavg: LoadavgValues;
  containers: DockerStatsRow[];
  dbSizeBytes: number | null;
  walSizeBytes: number | null;
  rootfsAvailBytes: number | null;
}

/**
 * `===SECTION===` マーカーで区切られたテキストをセクション名 → 本文へ分割する。
 * `collectMetricsCommands.ts` の `buildRemoteSpotScript` が出力する形式に対応。
 */
function splitMarkedSections(text: string): Record<string, string> {
  const sections: Record<string, string> = {};
  let current: string | null = null;
  for (const rawLine of text.split(/\r?\n/)) {
    const m = /^===(\w+)===$/.exec(rawLine.trim());
    if (m) {
      current = m[1];
      sections[current] = "";
      continue;
    }
    if (current) {
      sections[current] += `${rawLine}\n`;
    }
  }
  return sections;
}

/**
 * 数値1個のみを含むセクション本文（先頭行）を数値化する。パース失敗時は `null`。
 */
function parseFirstNumber(text: string): number | null {
  const firstLine = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (firstLine === undefined) return null;
  const value = Number(firstLine);
  return Number.isNaN(value) ? null : value;
}

/**
 * DBSIZEセクション（2行: db_size, wal_size）をパースする。
 */
function parseDbSizeSection(text: string): {
  dbSizeBytes: number | null;
  walSizeBytes: number | null;
} {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  const dbSizeBytes = lines[0] !== undefined ? Number(lines[0]) : NaN;
  const walSizeBytes = lines[1] !== undefined ? Number(lines[1]) : NaN;
  return {
    dbSizeBytes: Number.isNaN(dbSizeBytes) ? null : dbSizeBytes,
    walSizeBytes: Number.isNaN(walSizeBytes) ? null : walSizeBytes,
  };
}

/**
 * スポット収集（方式B）の1コマンド分の標準出力をパースする。
 * セクションが欠けていても例外は投げず、該当項目を `null`/空配列にする。
 */
export function parseSpotOutput(stdout: string): SpotMetrics {
  const sections = splitMarkedSections(stdout);

  const meminfo = parseMeminfo(sections.MEMINFO ?? "");
  const loadavg = parseLoadavg(sections.LOADAVG ?? "");
  const containers = parseDockerStats(sections.DOCKERSTATS ?? "");
  const { dbSizeBytes, walSizeBytes } = parseDbSizeSection(
    sections.DBSIZE ?? "",
  );
  const rootfsAvailBytes = parseFirstNumber(sections.ROOTFS ?? "");

  return { meminfo, loadavg, containers, dbSizeBytes, walSizeBytes, rootfsAvailBytes };
}

/** OOMイベント1件分のパース結果。 */
export interface ParsedOomEvent {
  occurredAtUtc: string;
  killedProcess: string | null;
  source: "journalctl" | "kern.log";
  rawLine: string;
}

const KILLED_PROCESS_RE = /Killed process\s+\d+\s+\(([^)]+)\)/i;

/**
 * `buildRemoteOomLogScript` の出力（`journalctl|`/`kernlog|` 接頭辞付き、
 * 1行1レコード）をパースする。パースできない行はスキップする
 * （壊れた行の許容。sync_history全体は失敗させない設計に合わせる）。
 */
export function parseOomLogOutput(text: string): ParsedOomEvent[] {
  const events: ParsedOomEvent[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;

    let source: "journalctl" | "kern.log";
    let content: string;
    if (line.startsWith("journalctl|")) {
      source = "journalctl";
      content = line.slice("journalctl|".length);
    } else if (line.startsWith("kernlog|")) {
      source = "kern.log";
      content = line.slice("kernlog|".length);
    } else {
      continue;
    }

    // journalctl -o short-iso: "2026-07-05T03:12:45+0000 host kernel: ..."
    const tsMatch = /^(\S+)\s+/.exec(content);
    if (!tsMatch) continue;
    const tsRaw = tsMatch[1];
    const parsedMs = Date.parse(tsRaw);
    if (Number.isNaN(parsedMs)) continue;
    const occurredAtUtc = new Date(parsedMs).toISOString();

    const killedMatch = KILLED_PROCESS_RE.exec(content);
    const killedProcess = killedMatch ? killedMatch[1] : null;

    events.push({ occurredAtUtc, killedProcess, source, rawLine: content.trim() });
  }

  return events;
}

/** collector出力（方式D）1コンテナ分のzodスキーマ。 */
const CollectorContainerSchema = z.object({
  name: z.string(),
  cpu_pct: z.number(),
  mem_bytes: z.number(),
  mem_limit_bytes: z.number(),
});

/** collector出力（方式D）1サンプル分のzodスキーマ（docs/design/data-sync-design.md §3.2）。 */
export const CollectorSampleSchema = z.object({
  v: z.string(),
  ts: z.string(),
  mem: z.object({
    total_kb: z.number(),
    available_kb: z.number(),
    free_kb: z.number(),
  }),
  swap: z.object({
    total_kb: z.number(),
    free_kb: z.number(),
  }),
  load: z.tuple([z.number(), z.number(), z.number()]),
  db: z.object({
    sqlite_bytes: z.number(),
    wal_bytes: z.number(),
  }),
  rootfs_avail_bytes: z.number(),
  containers: z.array(CollectorContainerSchema),
});
export type CollectorSample = z.infer<typeof CollectorSampleSchema>;

/**
 * collector出力ファイル(metrics.jsonl)の1行をパースする。
 * JSON解析エラー・スキーマ不一致の行は `null` を返す（呼び出し側でスキップする）。
 */
export function parseCollectorJsonlLine(line: string): CollectorSample | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    return null;
  }

  const parsed = CollectorSampleSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

/**
 * collector出力ファイル(metrics.jsonl)全体（複数行）をパースする。
 * @returns 正常にパースできたサンプルと、スキップした行数
 */
export function parseCollectorJsonl(text: string): {
  samples: CollectorSample[];
  skippedLines: number;
} {
  const samples: CollectorSample[] = [];
  let skippedLines = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    const sample = parseCollectorJsonlLine(trimmed);
    if (sample) {
      samples.push(sample);
    } else {
      skippedLines += 1;
    }
  }

  return { samples, skippedLines };
}

/** GCP Monitoringから取得したCPU使用率1サンプル分。 */
export interface ParsedCpuMetricPoint {
  tsUtc: string;
  cpuUtil: number;
}

/** Cloud Monitoring REST API（`timeSeries.list`）1ページ分のパース結果。 */
export interface ParsedCpuMetricsPage {
  points: ParsedCpuMetricPoint[];
  /** 次ページが存在する場合のトークン（呼び出し側がページネーションに使う）。 */
  nextPageToken?: string;
}

/**
 * Cloud Monitoring REST API（`timeSeries.list`）の1ページ分のレスポンスボディ
 * （JSON文字列）をパースする。
 * 想定外の構造・欠損フィールドを持つエントリはスキップする
 * （方式C取得失敗は警告のみで同期全体を失敗させない設計に合わせる）。
 *
 * レスポンス形式（REST）:
 * `{ timeSeries?: [{ points: [{ interval: { endTime }, value: { doubleValue } }] }], nextPageToken?: string }`
 */
export function parseCpuMetricsRestPage(text: string): ParsedCpuMetricsPage {
  const trimmed = text.trim();
  if (!trimmed) return { points: [] };

  let json: unknown;
  try {
    json = JSON.parse(trimmed);
  } catch {
    return { points: [] };
  }

  if (typeof json !== "object" || json === null) return { points: [] };

  const timeSeriesList = (json as { timeSeries?: unknown }).timeSeries;
  const nextPageTokenRaw = (json as { nextPageToken?: unknown }).nextPageToken;
  const nextPageToken =
    typeof nextPageTokenRaw === "string" && nextPageTokenRaw.length > 0
      ? nextPageTokenRaw
      : undefined;

  if (!Array.isArray(timeSeriesList)) {
    return { points: [], nextPageToken };
  }

  const pointsByTs = new Map<string, number>();

  for (const timeSeries of timeSeriesList) {
    if (typeof timeSeries !== "object" || timeSeries === null) continue;
    const points = (timeSeries as { points?: unknown }).points;
    if (!Array.isArray(points)) continue;

    for (const point of points) {
      if (typeof point !== "object" || point === null) continue;
      const interval = (point as { interval?: unknown }).interval;
      const value = (point as { value?: unknown }).value;
      if (typeof interval !== "object" || interval === null) continue;
      if (typeof value !== "object" || value === null) continue;

      const endTime = (interval as { endTime?: unknown }).endTime;
      const doubleValue = (value as { doubleValue?: unknown }).doubleValue;
      if (typeof endTime !== "string" || typeof doubleValue !== "number") {
        continue;
      }

      const ms = Date.parse(endTime);
      if (Number.isNaN(ms)) continue;

      pointsByTs.set(new Date(ms).toISOString(), doubleValue);
    }
  }

  const points = Array.from(pointsByTs.entries())
    .map(([tsUtc, cpuUtil]) => ({ tsUtc, cpuUtil }))
    .sort((a, b) => a.tsUtc.localeCompare(b.tsUtc));

  return { points, nextPageToken };
}
