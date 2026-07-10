/**
 * チャート表示用の純粋フォーマッタ。
 *
 * サーバー側の集計（`src/lib/aggregation`）とは無関係の「見た目」専用の変換のみを行う。
 * このディレクトリ（`src/components/charts`）専用の関数群（担当範囲の制約により`src/shared`には置かない）。
 */
import { formatJstDateTime, jstDayKey } from "@/shared/datetime";
import type { ChartValueUnit } from "./types";

const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

/** バイト数を読みやすい単位（B/KB/MB/GB）に整形する。 */
export function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes);
  if (abs >= GB) return `${(bytes / GB).toFixed(2)} GB`;
  if (abs >= MB) return `${(bytes / MB).toFixed(1)} MB`;
  if (abs >= KB) return `${(bytes / KB).toFixed(0)} KB`;
  return `${bytes} B`;
}

/** ミリ秒を読みやすい単位（ms/秒/分）に整形する。 */
export function formatDurationMs(ms: number): string {
  const abs = Math.abs(ms);
  if (abs >= 60_000) {
    return `${(ms / 60_000).toFixed(1)}分`;
  }
  if (abs >= 1000) {
    return `${(ms / 1000).toFixed(1)}秒`;
  }
  return `${ms}ms`;
}

/** 件数を3桁区切りで整形する。 */
export function formatCount(value: number): string {
  return value.toLocaleString("ja-JP");
}

/** 割合（0-100想定）を整形する。 */
export function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

/**
 * 単位指定に応じて値を整形する。`null`/`undefined` は欠測として "-" を返す
 * （ゼロ埋め表示にしない）。
 */
export function formatByUnit(
  value: number | null | undefined,
  unit: ChartValueUnit = "none",
): string {
  if (value === null || value === undefined) return "-";
  switch (unit) {
    case "bytes":
      return formatBytes(value);
    case "ms":
      return formatDurationMs(value);
    case "percent":
      return formatPercent(value);
    case "count":
      return formatCount(value);
    case "none":
    default:
      return String(value);
  }
}

/** 時間軸キーが時間次粒度（"YYYY-MM-DDTHH"）かどうか。 */
function isHourKey(key: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}$/.test(key);
}

/**
 * 時間軸キー（"YYYY-MM-DD" or "YYYY-MM-DDTHH"）を軸目盛り用の短い表示に整形する。
 * 年は省略し、日次は "MM/DD"、時間次は "MM/DD HH時" とする。
 */
export function formatAxisTick(key: string): string {
  if (isHourKey(key)) {
    const [dayPart, hourPart] = key.split("T");
    const [, month, day] = dayPart.split("-");
    return `${month}/${day} ${hourPart}時`;
  }
  const [, month, day] = key.split("-");
  return `${month}/${day}`;
}

/**
 * Tooltip用の時刻表示。`timestampUtc` があればJSTの日時（分まで）で正確に表示し、
 * 無ければ `key` をそのまま整形して表示する（フォールバック）。
 */
export function formatTooltipTime(key: string, timestampUtc?: string): string {
  if (timestampUtc) {
    return `${formatJstDateTime(timestampUtc)} (JST)`;
  }
  if (isHourKey(key)) {
    const [dayPart, hourPart] = key.split("T");
    return `${dayPart} ${hourPart}:00 (JST)`;
  }
  return `${key} (JST)`;
}

/** 日次キー（"YYYY-MM-DD"）へ丸める。イベントマーカーの整合確認等に利用可能。 */
export function toDayKeyFromUtc(utcIso: string): string {
  return jstDayKey(utcIso);
}
