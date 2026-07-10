"use client";

import { formatByUnit, formatTooltipTime } from "./format";
import type { CategoryDatum, ChartSeries, TimeSeriesDatum } from "./types";
import styles from "./ChartTooltip.module.css";

/** Recharts の `content` propに渡す1系列分のpayload項目（必要な範囲のみ型付け）。 */
export interface ChartTooltipPayloadItem {
  dataKey?: string | number;
  value?: number | string | null;
  payload?: TimeSeriesDatum;
}

export interface ChartTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: ChartTooltipPayloadItem[];
  /** dataKeyごとの系列定義（表示名・単位・色の解決に使う） */
  series: ChartSeries[];
}

/**
 * 時系列チャート共通のカスタムTooltip。
 *
 * - 見出し時刻はJST表示（`timestampUtc` があれば分単位まで正確に、無ければキーから整形）
 * - 値は系列ごとの単位（bytes→MB/GB、ms→秒/分等）でフォーマットする
 * - 欠測（`null`）は "-" と表示する（frontend-design.md §4.1）
 */
export function ChartTooltip({ active, label, payload, series }: ChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const datum = payload[0]?.payload;
  const timeLabel = formatTooltipTime(String(label ?? datum?.key ?? ""), datum?.timestampUtc);

  return (
    <div className={styles.tooltip} role="tooltip">
      <p className={styles.time}>{timeLabel}</p>
      <ul className={styles.list}>
        {payload.map((item) => {
          const def = series.find((s) => s.dataKey === item.dataKey);
          const rawValue =
            typeof item.value === "number" ? item.value : (item.value ?? null);
          const value = typeof rawValue === "number" ? rawValue : null;
          return (
            <li key={String(item.dataKey)} className={styles.row}>
              <span
                className={styles.swatch}
                style={{ background: def?.color ?? "var(--text-secondary)" }}
                aria-hidden="true"
              />
              <span className={styles.name}>{def?.name ?? String(item.dataKey)}</span>
              <span className={styles.value}>{formatByUnit(value, def?.unit)}</span>
            </li>
          );
        })}
      </ul>
      {datum?.isApprox ? <p className={styles.approx}>UTC区切りの近似値</p> : null}
    </div>
  );
}

/** `CategoryBarChart` 用のpayload項目（カテゴリ軸のため`payload`の型が異なる）。 */
export interface CategoryChartTooltipPayloadItem {
  dataKey?: string | number;
  value?: number | string | null;
  payload?: CategoryDatum;
}

export interface CategoryChartTooltipProps {
  active?: boolean;
  payload?: CategoryChartTooltipPayloadItem[];
  series: ChartSeries[];
}

/**
 * カテゴリ比較チャート（`CategoryBarChart`）共通のカスタムTooltip。
 * 見出しはカテゴリ名（`label`）で、時刻表示は行わない。
 */
export function CategoryChartTooltip({ active, payload, series }: CategoryChartTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const datum = payload[0]?.payload;

  return (
    <div className={styles.tooltip} role="tooltip">
      <p className={styles.time}>{datum?.label ?? ""}</p>
      <ul className={styles.list}>
        {payload.map((item) => {
          const def = series.find((s) => s.dataKey === item.dataKey);
          const value = typeof item.value === "number" ? item.value : null;
          return (
            <li key={String(item.dataKey)} className={styles.row}>
              <span
                className={styles.swatch}
                style={{ background: def?.color ?? "var(--text-secondary)" }}
                aria-hidden="true"
              />
              <span className={styles.name}>{def?.name ?? String(item.dataKey)}</span>
              <span className={styles.value}>{formatByUnit(value, def?.unit)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
