"use client";

import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartTooltip } from "./ChartTooltip";
import type { ChartValueUnit, TimeSeriesDatum } from "./types";
import styles from "./Sparkline.module.css";

export interface SparklinePoint {
  /** 時間軸キー（"YYYY-MM-DD" 等）。`TimelinePoint.key` と同形式 */
  key: string;
  /** 値。欠測は `null`（ゼロ埋め・補間禁止） */
  value: number | null;
  /** Tooltip表示用の代表UTC時刻（`showTooltip`利用時） */
  timestampUtc?: string;
  isApprox?: boolean;
}

export interface SparklineProps {
  data: SparklinePoint[];
  /** 系列色。tokens.cssのCSS変数を参照（例: "var(--series-memory)"） */
  color?: string;
  height?: number;
  width?: number | string;
  /** Tooltipを表示するか（既定は非表示。ダッシュボードの小型表示用途のため） */
  showTooltip?: boolean;
  /** Tooltip表示時の値の単位 */
  unit?: ChartValueUnit;
  /** Tooltipでの系列名 */
  name?: string;
  /** アクセシビリティ用のラベル（軸・凡例を持たないため必須級） */
  ariaLabel?: string;
}

/**
 * ダッシュボード用の小型スパークライン（軸・凡例なし。frontend-design.md §3/§4）。
 *
 * 欠測は `connectNulls={false}` でギャップとして表示する（ゼロ埋め禁止）。
 */
export function Sparkline({
  data,
  color = "var(--series-memory)",
  height = 40,
  width = "100%",
  showTooltip = false,
  unit = "none",
  name = "値",
  ariaLabel,
}: SparklineProps) {
  const series = [{ dataKey: "value", name, color, unit }];

  return (
    <div className={styles.wrapper} style={{ height, width }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={data as unknown as TimeSeriesDatum[]}
          margin={{ top: 2, right: 2, left: 2, bottom: 2 }}
        >
          <XAxis dataKey="key" hide />
          <YAxis hide domain={["auto", "auto"]} />
          {showTooltip ? <Tooltip content={<ChartTooltip series={series} />} /> : null}
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            fill={color}
            fillOpacity={0.2}
            strokeWidth={1.5}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
