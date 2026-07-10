import "server-only";

import { jstDayKey, jstHourKey } from "../../shared/datetime";

/**
 * 時系列整形（api-design.md §4.4 / 要件 §6.2）。
 *
 * 指定期間の連続した時間軸（欠測区間も含む）を生成し、データがない区間は
 * `null`（欠測）として明示する。時間軸の右端は常に「今日（JST）」までとし、
 * ゼロ埋め・補間は行わない。
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/** "YYYY-MM-DD" を、あくまで線形な軸生成用の代表エポック(ms)へ変換する。 */
function dayKeyToEpochMs(dayKey: string): number {
  const [y, m, d] = dayKey.split("-").map(Number);
  if (!y || !m || !d) {
    throw new Error(`invalid day key: ${dayKey}`);
  }
  return Date.UTC(y, m - 1, d);
}

function epochMsToDayKey(epochMs: number): string {
  const d = new Date(epochMs);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** "YYYY-MM-DDTHH" を、あくまで線形な軸生成用の代表エポック(ms)へ変換する。 */
function hourKeyToEpochMs(hourKey: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})$/.exec(hourKey);
  if (!match) {
    throw new Error(`invalid hour key: ${hourKey}`);
  }
  const [, y, m, d, h] = match;
  return Date.UTC(Number(y), Number(m) - 1, Number(d), Number(h));
}

function epochMsToHourKey(epochMs: number): string {
  const d = new Date(epochMs);
  return `${epochMsToDayKey(epochMs)}T${pad(d.getUTCHours())}`;
}

/**
 * `sinceDayKey`（JST日付, YYYY-MM-DD）から、`nowUtcIso` が属するJST日付までの
 * 連続した日次キー配列を生成する。範囲が逆転している場合は空配列を返す。
 */
export function buildDailyAxis(sinceDayKey: string, nowUtcIso: string): string[] {
  const untilKey = jstDayKey(nowUtcIso);
  const startMs = dayKeyToEpochMs(sinceDayKey);
  const endMs = dayKeyToEpochMs(untilKey);
  if (endMs < startMs) return [];

  const keys: string[] = [];
  for (let t = startMs; t <= endMs; t += DAY_MS) {
    keys.push(epochMsToDayKey(t));
  }
  return keys;
}

/**
 * `sinceHourKey`（JST時刻, YYYY-MM-DDTHH）から、`nowUtcIso` が属するJST時刻までの
 * 連続した時間キー配列を生成する。範囲が逆転している場合は空配列を返す。
 */
export function buildHourlyAxis(sinceHourKey: string, nowUtcIso: string): string[] {
  const untilKey = jstHourKey(nowUtcIso);
  const startMs = hourKeyToEpochMs(sinceHourKey);
  const endMs = hourKeyToEpochMs(untilKey);
  if (endMs < startMs) return [];

  const keys: string[] = [];
  for (let t = startMs; t <= endMs; t += HOUR_MS) {
    keys.push(epochMsToHourKey(t));
  }
  return keys;
}

/** 時間軸上の1点。データがない区間は `value: null`（欠測）。 */
export interface TimelinePoint<T> {
  key: string;
  value: T | null;
}

/**
 * 生成済みの時間軸（`buildDailyAxis`/`buildHourlyAxis`）に対し、キー→値のMapから
 * 値を割り当てる。軸に存在してMapに無いキーは欠測として `null` を明示する
 * （ゼロ埋め・補間はしない。api-design.md §4.4）。
 */
export function fillTimeline<T>(
  axis: readonly string[],
  valuesByKey: ReadonlyMap<string, T>,
): TimelinePoint<T>[] {
  return axis.map((key) => ({
    key,
    value: valuesByKey.has(key) ? (valuesByKey.get(key) as T) : null,
  }));
}
