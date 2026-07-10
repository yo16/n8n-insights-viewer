"use client";

import type { ReactNode } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer } from "./ChartContainer";
import { ChartTooltip } from "./ChartTooltip";
import { formatAxisTick, formatByUnit } from "./format";
import type {
  ChartEventMarker,
  ChartLegendItem,
  ChartSeries,
  ChartThreshold,
  TimeSeriesDatum,
} from "./types";
import styles from "./TimeSeriesChart.module.css";

const THRESHOLD_COLOR: Record<ChartThreshold["level"], string> = {
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
};

export interface TimeSeriesChartProps {
  /** 時間軸に沿ったデータ点（欠測は`value`側で`null`を明示する）。軸の切り詰めはしない */
  data: TimeSeriesDatum[];
  /** 描画する系列 */
  series: ChartSeries[];
  /** 閾値参照線（注意/危険。要件 §6.3） */
  thresholds?: ChartThreshold[];
  /** イベントマーカー（OOM発生時刻等。要件 §6.3） */
  eventMarkers?: ChartEventMarker[];
  /** チャートタイトル */
  title?: string;
  /** チャート本体の高さ(px) */
  height?: number;
  /** Y軸の値フォーマット単位（単一系列想定時のY軸目盛り表示に使用。省略時は数値そのまま） */
  yAxisUnit?: ChartSeries["unit"];
  /** 凡例を表示するか（省略時は`series`から自動生成） */
  legend?: ChartLegendItem[] | false;
  /** チャート下部に追加で表示する注記（UTC近似注記の後に表示） */
  footnote?: ReactNode;
}

/**
 * 時系列の折れ線/エリアチャート共通ラッパー（frontend-design.md §4）。
 *
 * - 欠測ギャップ: `connectNulls={false}` を明示し、`null` は線を切る（ゼロ埋め・補間禁止）
 * - 時間軸: 渡された `data` の並びをそのまま使う（右端を「今日」に切り詰める処理はServer側の責務）
 * - 閾値参照線・イベントマーカー・UTC近似注記に対応
 */
export function TimeSeriesChart({
  data,
  series,
  thresholds = [],
  eventMarkers = [],
  title,
  height = 280,
  yAxisUnit = "none",
  legend,
  footnote,
}: TimeSeriesChartProps) {
  const resolvedLegend: ChartLegendItem[] =
    legend === false
      ? []
      : (legend ??
        series.map((s) => ({
          label: s.name,
          color: s.color,
          strokeDasharray: s.strokeDasharray,
        })));

  const hasApprox = data.some((d) => d.isApprox === true);

  return (
    <ChartContainer
      title={title}
      legend={resolvedLegend}
      height={height}
      footnote={
        hasApprox || footnote ? (
          <>
            {hasApprox ? <p>この期間の日次値はUTC区切りの近似値です（JSTとは最大9時間ずれる場合があります）。</p> : null}
            {footnote}
          </>
        ) : undefined
      }
    >
      <div className={styles.wrapper}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 8 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              dataKey="key"
              tickFormatter={formatAxisTick}
              tick={{ fontSize: 12, fill: "var(--text-secondary)" }}
              stroke="var(--border)"
            />
            <YAxis
              tickFormatter={(v: number) => formatByUnit(v, yAxisUnit)}
              tick={{ fontSize: 12, fill: "var(--text-secondary)" }}
              stroke="var(--border)"
              width={64}
            />
            <Tooltip content={<ChartTooltip series={series} />} />
            {thresholds.map((t) => (
              <ReferenceLine
                key={`${t.level}-${t.value}`}
                y={t.value}
                stroke={THRESHOLD_COLOR[t.level]}
                strokeDasharray="4 4"
                label={
                  t.label
                    ? { value: t.label, position: "insideTopRight", fill: THRESHOLD_COLOR[t.level], fontSize: 12 }
                    : undefined
                }
              />
            ))}
            {eventMarkers.map((m) => (
              <ReferenceLine
                key={`event-${m.key}`}
                x={m.key}
                stroke="var(--color-danger)"
                strokeDasharray="2 2"
                label={
                  m.label
                    ? { value: m.label, position: "top", fill: "var(--color-danger)", fontSize: 12 }
                    : undefined
                }
              />
            ))}
            {series.map((s) =>
              s.type === "area" ? (
                <Area
                  key={s.dataKey}
                  type="monotone"
                  dataKey={s.dataKey}
                  name={s.name}
                  stroke={s.color}
                  fill={s.color}
                  fillOpacity={0.15}
                  strokeDasharray={s.strokeDasharray}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ) : (
                <Line
                  key={s.dataKey}
                  type="monotone"
                  dataKey={s.dataKey}
                  name={s.name}
                  stroke={s.color}
                  strokeDasharray={s.strokeDasharray}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ),
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartContainer>
  );
}
