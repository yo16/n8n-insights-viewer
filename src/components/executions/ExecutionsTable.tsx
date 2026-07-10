import type { ExecutionEntityRow } from "@/shared/types";
import { ExecutionStatusBadge } from "./ExecutionStatusBadge";
import { formatExecutionDateTime, formatExecutionDuration } from "./format";
import styles from "./ExecutionsTable.module.css";

/**
 * 画面4（実行明細）の一覧テーブル。
 *
 * `docs/design/frontend-design.md` 画面4: 実行ID・ワークフロー名・状態・モード・
 * 開始/終了（JST）・所要時間を表示し、status=error/crashedの行は状態色で強調する。
 */

const HIGHLIGHT_STATUSES = new Set(["error", "crashed"]);

export type ExecutionsTableProps = {
  rows: ExecutionEntityRow[];
  /** workflowId → ワークフロー名 の解決マップ（`queries/workflows.ts` 由来） */
  workflowNames: Map<string, string>;
};

export function ExecutionsTable({ rows, workflowNames }: ExecutionsTableProps) {
  return (
    <div className={styles.tableWrapper}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">実行ID</th>
            <th scope="col">ワークフロー名</th>
            <th scope="col">状態</th>
            <th scope="col">モード</th>
            <th scope="col">開始（JST）</th>
            <th scope="col">終了（JST）</th>
            <th scope="col">所要時間</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const highlight = row.status !== null && HIGHLIGHT_STATUSES.has(row.status);
            const workflowName =
              (row.workflowId ? workflowNames.get(row.workflowId) : undefined) ??
              row.workflowId ??
              "—";

            return (
              <tr key={row.id} className={highlight ? styles.rowDanger : undefined}>
                <td>{row.id}</td>
                <td>{workflowName}</td>
                <td>
                  <ExecutionStatusBadge status={row.status} />
                </td>
                <td>{row.mode ?? "—"}</td>
                <td>{formatExecutionDateTime(row.startedAt)}</td>
                <td>{formatExecutionDateTime(row.stoppedAt)}</td>
                <td>{formatExecutionDuration(row.startedAt, row.stoppedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
