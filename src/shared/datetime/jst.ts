/**
 * JST（Asia/Tokyo）変換の純粋関数群。
 *
 * - UTC+9固定オフセット（DST無し）。date-fns-tz等の外部ライブラリは使わない
 * - ローカル実行端末のタイムゾーンに依存させないため、`getUTC*` 系のメソッドのみ使用する
 *   （`getDate()` 等のローカルTZ依存メソッドは禁止。api-design.md §4.2）
 * - Next.js非依存の純粋TSであり、同期CLIとBIの双方から相対importで使う（app-architecture.md §3.3）
 */

/** JSTのUTCからのオフセット（ミリ秒） */
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** JSTに変換した日時の各要素（すべてJST基準の値） */
export interface JstParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number; // 0-23
  minute: number;
  second: number;
  millisecond: number;
}

/**
 * UTCのISO8601文字列（またはDateとして解釈可能な文字列）をUnixエポックミリ秒へ変換する。
 * 解釈できない場合はエラーを投げる。
 */
function parseUtcToEpochMs(utcIso: string): number {
  const epochMs = new Date(utcIso).getTime();
  if (Number.isNaN(epochMs)) {
    throw new Error(`invalid ISO8601 datetime: ${utcIso}`);
  }
  return epochMs;
}

/**
 * UTCの日時文字列をJSTの日時パーツへ変換する。
 * 内部的にはUTC+9時間シフトした上でgetUTC*系のみを使い、ローカルTZに依存しない。
 */
export function utcToJst(utcIso: string): JstParts {
  const jstEpochMs = parseUtcToEpochMs(utcIso) + JST_OFFSET_MS;
  const d = new Date(jstEpochMs);
  return {
    year: d.getUTCFullYear(),
    month: d.getUTCMonth() + 1,
    day: d.getUTCDate(),
    hour: d.getUTCHours(),
    minute: d.getUTCMinutes(),
    second: d.getUTCSeconds(),
    millisecond: d.getUTCMilliseconds(),
  };
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/**
 * JSTの日付キー（YYYY-MM-DD）。日次集計のグルーピングキーに使う
 * （hour/day/week混在の正規化は集計層＝lib/aggregationの責務。ここではキー生成のみ提供する）
 */
export function jstDayKey(utcIso: string): string {
  const { year, month, day } = utcToJst(utcIso);
  return `${year}-${pad(month)}-${pad(day)}`;
}

/**
 * JSTの時間キー（YYYY-MM-DDTHH）。hour粒度の集計グルーピングキーに使う
 */
export function jstHourKey(utcIso: string): string {
  const { hour } = utcToJst(utcIso);
  return `${jstDayKey(utcIso)}T${pad(hour)}`;
}

/** 表示用フォーマッタ: YYYY-MM-DD（JST） */
export function formatJstDate(utcIso: string): string {
  return jstDayKey(utcIso);
}

/** 表示用フォーマッタ: YYYY-MM-DD HH:mm（JST） */
export function formatJstDateTime(utcIso: string): string {
  const { hour, minute } = utcToJst(utcIso);
  return `${jstDayKey(utcIso)} ${pad(hour)}:${pad(minute)}`;
}

/**
 * 2つのUTC日時が同じJST日付（YYYY-MM-DD）に属するか判定する。
 * 日付跨ぎの境界判定（例: 「今日」判定）に使う純粋関数。
 */
export function isSameJstDay(aUtcIso: string, bUtcIso: string): boolean {
  return jstDayKey(aUtcIso) === jstDayKey(bUtcIso);
}
