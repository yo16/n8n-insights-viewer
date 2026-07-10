"use client";

import type { AriaAttributes } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { formatCount, formatDurationMs, formatPercent } from "@/components/charts/format";
import type { SortKey, SortOrder, WorkflowSummaryRowWithDerived } from "./types";
import styles from "./WorkflowsTable.module.css";

export type WorkflowsTableProps = {
  rows: WorkflowSummaryRowWithDerived[];
  sortKey: SortKey;
  order: SortOrder;
};

type ColumnDef = {
  key: SortKey;
  label: string;
  align?: "left" | "right";
};

const COLUMNS: ColumnDef[] = [
  { key: "name", label: "ワークフロー名" },
  { key: "active", label: "状態" },
  { key: "executionCount", label: "実行数", align: "right" },
  { key: "successRate", label: "成功率", align: "right" },
  { key: "avgRuntimeMs", label: "平均実行時間", align: "right" },
  { key: "totalRuntimeMs", label: "合計実行時間", align: "right" },
  { key: "statisticsTotalCount", label: "生涯累計", align: "right" },
];

/**
 * 成功率から強調レベルを判定する（画面3固有の閾値。PM未定義のため独自判断・2026-07-10）。
 *
 * `config/thresholds.json` にはメモリ/DBサイズ等の閾値のみ定義されており成功率の
 * 閾値は定義がないため、本コンポーネント内に暫定値を持つ
 * （95%以上=正常、80%以上=注意、それ未満=危険）。
 */
function successRateLevel(rate: number | null): "normal" | "warning" | "danger" | null {
  if (rate === null) return null;
  if (rate < 80) return "danger";
  if (rate < 95) return "warning";
  return "normal";
}

const LEVEL_ROW_CLASS: Record<"normal" | "warning" | "danger", string> = {
  normal: "",
  warning: styles.rowWarning,
  danger: styles.rowDanger,
};

const LEVEL_ICON: Record<"warning" | "danger", string> = {
  warning: "⚠",
  danger: "✕",
};

const LEVEL_SR_LABEL: Record<"warning" | "danger", string> = {
  warning: "注意",
  danger: "危険",
};

/**
 * 画面3（ワークフロー別一覧）のソート可能なデータテーブル。
 *
 * ヘッダクリックでURL searchParams（sort/order）を更新し、Server Component側で
 * 再ソートさせる（`docs/design/frontend-design.md` 画面3）。成功率が低い行は
 * 状態色トークン + アイコン + テキストで視覚的に強調する（色のみに依存しない）。
 */
export function WorkflowsTable({ rows, sortKey, order }: WorkflowsTableProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleSort(key: SortKey) {
    const params = new URLSearchParams(searchParams.toString());
    const nextOrder: SortOrder = sortKey === key && order === "asc" ? "desc" : "asc";
    params.set("sort", key);
    params.set("order", nextOrder);
    router.push(`${pathname}?${params.toString()}`);
  }

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          {COLUMNS.map((col) => {
            const isSorted = sortKey === col.key;
            const ariaSort: AriaAttributes["aria-sort"] = isSorted
              ? order === "asc"
                ? "ascending"
                : "descending"
              : "none";
            return (
              <th
                key={col.key}
                scope="col"
                aria-sort={ariaSort}
                className={col.align === "right" ? styles.numericHeader : undefined}
              >
                <button
                  type="button"
                  className={styles.sortButton}
                  onClick={() => handleSort(col.key)}
                >
                  {col.label}
                  <span className={styles.sortIcon} aria-hidden="true">
                    {isSorted ? (order === "asc" ? "▲" : "▼") : ""}
                  </span>
                </button>
              </th>
            );
          })}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const level = successRateLevel(row.successRate);
          const rowClassName = level && level !== "normal" ? LEVEL_ROW_CLASS[level] : undefined;

          return (
            <tr key={row.workflowId} className={rowClassName}>
              <td>{row.name}</td>
              <td>
                <span className={row.active ? styles.activeBadge : styles.inactiveBadge}>
                  {row.active ? "アクティブ" : "非アクティブ"}
                </span>
              </td>
              <td className={styles.numeric}>{formatCount(row.executionCount)}</td>
              <td className={styles.numeric}>
                {row.successRate === null ? (
                  "-"
                ) : level && level !== "normal" ? (
                  <span className={styles.warnValue}>
                    <span aria-hidden="true">{LEVEL_ICON[level]}</span>{" "}
                    {formatPercent(row.successRate)}
                    <span className={styles.srOnly}>（{LEVEL_SR_LABEL[level]}）</span>
                  </span>
                ) : (
                  formatPercent(row.successRate)
                )}
              </td>
              <td className={styles.numeric}>
                {row.avgRuntimeMs === null ? "-" : formatDurationMs(row.avgRuntimeMs)}
              </td>
              <td className={styles.numeric}>{formatDurationMs(row.totalRuntimeMs)}</td>
              <td className={styles.numeric}>{formatCount(row.statisticsTotalCount)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
