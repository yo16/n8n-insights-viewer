import type { WorkflowSummaryRow } from "@/lib/db/queries/workflows";

/**
 * 画面3（ワークフロー別一覧）のソート対象キー。
 * `WorkflowSummaryRowWithDerived` のフィールド名に対応する。
 */
export type SortKey =
  | "name"
  | "active"
  | "executionCount"
  | "successRate"
  | "avgRuntimeMs"
  | "totalRuntimeMs"
  | "statisticsTotalCount";

export type SortOrder = "asc" | "desc";

/** URL searchParamsで受け付けるソートキー（既定は "name"）。 */
export const SORT_KEYS: readonly SortKey[] = [
  "name",
  "active",
  "executionCount",
  "successRate",
  "avgRuntimeMs",
  "totalRuntimeMs",
  "statisticsTotalCount",
];

export const DEFAULT_SORT_KEY: SortKey = "name";
export const DEFAULT_SORT_ORDER: SortOrder = "asc";

/**
 * `WorkflowSummaryRow` に画面表示用の派生指標（成功率・平均実行時間）を加えた行。
 *
 * 実行数が0のワークフローは成功率・平均実行時間を算出できないため `null`
 * （0%表示は誤解を招くため欠測として扱う。`docs/design/frontend-design.md` 画面3）。
 */
export interface WorkflowSummaryRowWithDerived extends WorkflowSummaryRow {
  /** 成功率（0-100）。executionCountが0の場合は null */
  successRate: number | null;
  /** 平均実行時間（ms）。executionCountが0の場合は null */
  avgRuntimeMs: number | null;
}
