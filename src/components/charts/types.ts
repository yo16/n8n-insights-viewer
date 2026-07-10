/**
 * チャート共通型定義（docs/design/frontend-design.md §4 / styling-design.md §5）。
 *
 * データ生成はServer側（`src/lib/aggregation`）の責務。ここではRechartsラッパーが
 * 受け取るpropsの形だけを定義する（描画に専念、ロジックは持たない）。
 */

/** 値の単位。Tooltip等での表示フォーマットに使う（bytes→MB/GB、ms→秒/分等）。 */
export type ChartValueUnit = "bytes" | "ms" | "count" | "percent" | "none";

/**
 * 時系列チャートの1点。
 *
 * `key` は `src/lib/aggregation/timeline.ts` の `TimelinePoint.key` と同じ形式
 * （日次: "YYYY-MM-DD" / 時間次: "YYYY-MM-DDTHH"、いずれもJST基準のキー）。
 * 系列値は `dataKey` ごとのプロパティとして持たせ、欠測は `null`
 * （ゼロ埋め・補間は行わない。frontend-design.md §4.1）。
 */
export interface TimeSeriesDatum {
  /** 時間軸キー（JST基準。"YYYY-MM-DD" or "YYYY-MM-DDTHH"） */
  key: string;
  /** Tooltip等でJST時刻を正確に表示するための代表UTC ISO8601時刻（省略時は`key`を整形して表示） */
  timestampUtc?: string;
  /** この点がUTC区切りの日次近似集計に基づくか（要件 §6.2） */
  isApprox?: boolean;
  /** 系列値（`ChartSeries.dataKey` に対応）。欠測は `null` */
  [seriesDataKey: string]: string | number | boolean | null | undefined;
}

/** チャート系列の見た目・意味付け定義。 */
export interface ChartSeries {
  /** `TimeSeriesDatum` / カテゴリデータ上のプロパティ名 */
  dataKey: string;
  /** 凡例・Tooltipでの表示名 */
  name: string;
  /** 系列色。tokens.cssのCSS変数を参照する文字列（例: "var(--series-runtime)"）。ハードコード禁止 */
  color: string;
  /** 折れ線 or 面。省略時は "line"（TimeSeriesChartのみで使用） */
  type?: "line" | "area";
  /** Tooltip表示時の値フォーマット単位 */
  unit?: ChartValueUnit;
  /** 破線パターン（推定値・参考値系列等の区別用。SVG strokeDasharray） */
  strokeDasharray?: string;
}

/** 閾値参照線（注意/危険の2段。要件 §6.3）。 */
export interface ChartThreshold {
  /** Y軸上の値 */
  value: number;
  /** ラベル（省略可） */
  label?: string;
  /** 注意 or 危険（色はtokens.cssの状態カラーに対応） */
  level: "warning" | "danger";
}

/** イベントマーカー（OOM発生時刻など。要件 §6.3）。 */
export interface ChartEventMarker {
  /** マーカーを立てる時間軸キー。データ点の`key`と同じ形式・同じ粒度で一致させること */
  key: string;
  /** ラベル（省略可。例: "OOM"） */
  label?: string;
}

/**
 * カテゴリ比較チャート（`CategoryBarChart`）の1項目。
 * ワークフロー別集計など、時間軸ではなくカテゴリを軸にした比較に使う。
 */
export interface CategoryDatum {
  /** 一意なカテゴリキー（例: workflowId） */
  key: string;
  /** 軸・Tooltipに表示するカテゴリ名（例: ワークフロー名） */
  label: string;
  /** 系列値（`ChartSeries.dataKey` に対応）。欠測は `null` */
  [seriesDataKey: string]: string | number | boolean | null | undefined;
}

/** ChartContainer内で使うカスタム凡例の1項目。 */
export interface ChartLegendItem {
  label: string;
  color: string;
  /** 破線などの系列であることを凡例上でも示す */
  strokeDasharray?: string;
}
