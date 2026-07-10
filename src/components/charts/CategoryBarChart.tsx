"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CategoryChartTooltip } from "./ChartTooltip";
import { ChartContainer } from "./ChartContainer";
import { formatByUnit } from "./format";
import type { CategoryDatum, ChartLegendItem, ChartSeries } from "./types";
import styles from "./CategoryBarChart.module.css";

export interface CategoryBarChartProps {
  /** カテゴリごとのデータ（例: ワークフロー別の実行数） */
  data: CategoryDatum[];
  /** 描画する系列 */
  series: ChartSeries[];
  /** 複数系列を積み上げるか（例: 成功/失敗の内訳） */
  stacked?: boolean;
  /** チャートタイトル */
  title?: string;
  /** チャート本体の高さ(px)。カテゴリ数に応じて呼び出し側で調整すること */
  height?: number;
  /** 値軸の単位（フォーマットに使用） */
  valueUnit?: ChartSeries["unit"];
  /** 凡例（省略時は`series`から自動生成、複数系列のときのみ既定で表示） */
  legend?: ChartLegendItem[] | false;
}

/**
 * カテゴリ比較用の横棒グラフ共通ラッパー（frontend-design.md §4「BarChart系ラッパー」）。
 *
 * ワークフロー別の実行数・成功率等、カテゴリ軸での比較に使う。
 * ソート・絞り込みはServer側（`src/lib/aggregation` / クエリ層）の責務で、本コンポーネントは
 * 渡された順序のまま描画する。
 */
export function CategoryBarChart({
  data,
  series,
  stacked = false,
  title,
  height = 280,
  valueUnit = "none",
  legend,
}: CategoryBarChartProps) {
  const resolvedLegend: ChartLegendItem[] =
    legend === false
      ? []
      : (legend ?? (series.length > 1 ? series.map((s) => ({ label: s.name, color: s.color })) : []));

  const stackId = stacked ? "category-bar-stack" : undefined;

  return (
    <ChartContainer title={title} legend={resolvedLegend} height={height}>
      <div className={styles.wrapper}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
          >
            <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
            <XAxis
              type="number"
              tickFormatter={(v: number) => formatByUnit(v, valueUnit)}
              tick={{ fontSize: 12, fill: "var(--text-secondary)" }}
              stroke="var(--border)"
            />
            <YAxis
              type="category"
              dataKey="label"
              width={120}
              tick={{ fontSize: 12, fill: "var(--text-secondary)" }}
              stroke="var(--border)"
            />
            <Tooltip content={<CategoryChartTooltip series={series} />} />
            {series.map((s) => (
              <Bar key={s.dataKey} dataKey={s.dataKey} name={s.name} fill={s.color} stackId={stackId} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartContainer>
  );
}
