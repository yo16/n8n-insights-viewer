import type { WorkflowSummaryRow } from "@/lib/db/queries/workflows";
import type { SortKey, SortOrder, WorkflowSummaryRowWithDerived } from "./types";

/**
 * 画面3（ワークフロー別一覧）のソート・派生指標算出ロジック。
 *
 * ソートはServer Component（`app/workflows/page.tsx`）側で適用する
 * （`docs/design/frontend-design.md` 画面3「ソート…URL searchParams」）。
 * 純粋関数として切り出し、テスト容易性・Server/Client双方からの再利用を可能にする。
 */

/** `WorkflowSummaryRow` に成功率・平均実行時間の派生指標を付与する。 */
export function withDerivedMetrics(
  rows: WorkflowSummaryRow[],
): WorkflowSummaryRowWithDerived[] {
  return rows.map((row) => ({
    ...row,
    successRate:
      row.executionCount > 0 ? (row.successCount / row.executionCount) * 100 : null,
    avgRuntimeMs: row.executionCount > 0 ? row.totalRuntimeMs / row.executionCount : null,
  }));
}

function getSortValue(
  row: WorkflowSummaryRowWithDerived,
  key: SortKey,
): number | string | null {
  switch (key) {
    case "name":
      return row.name;
    case "active":
      return row.active;
    case "executionCount":
      return row.executionCount;
    case "successRate":
      return row.successRate;
    case "avgRuntimeMs":
      return row.avgRuntimeMs;
    case "totalRuntimeMs":
      return row.totalRuntimeMs;
    case "statisticsTotalCount":
      return row.statisticsTotalCount;
    default:
      return null;
  }
}

/**
 * 2値を比較する。`null`（未算出。実行数0）は常に末尾に配置する
 * （ソート順が昇順/降順のいずれでも、値が無い行は末尾に固定する）。
 */
function compare(
  va: number | string | null,
  vb: number | string | null,
  order: SortOrder,
): number {
  if (va === null && vb === null) return 0;
  if (va === null) return 1;
  if (vb === null) return -1;

  const cmp =
    typeof va === "string" && typeof vb === "string"
      ? va.localeCompare(vb, "ja")
      : (va as number) - (vb as number);

  return order === "asc" ? cmp : -cmp;
}

/** 行配列を指定キー・順序でソートする（元配列は変更しない）。 */
export function sortWorkflowRows(
  rows: WorkflowSummaryRowWithDerived[],
  key: SortKey,
  order: SortOrder,
): WorkflowSummaryRowWithDerived[] {
  return [...rows].sort((a, b) => compare(getSortValue(a, key), getSortValue(b, key), order));
}
