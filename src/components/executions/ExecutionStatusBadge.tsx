import styles from "./ExecutionStatusBadge.module.css";

/**
 * 実行明細の状態バッジ。
 *
 * ダッシュボード等の `ui/StatusBadge`（正常/注意/危険の3段判定）とは異なり、
 * execution_entity.status の実値（success/error/crashed 等）をそのまま表示しつつ
 * 色分けする（`docs/design/frontend-design.md` 画面4: 「状態（色付きバッジ）」）。
 */

const DANGER_STATUSES = new Set(["error", "crashed"]);
const NORMAL_STATUSES = new Set(["success"]);

export type ExecutionStatusBadgeProps = {
  status: string | null;
};

function resolveClass(status: string | null): string {
  if (status !== null && NORMAL_STATUSES.has(status)) return styles.normal;
  if (status !== null && DANGER_STATUSES.has(status)) return styles.danger;
  return styles.neutral;
}

export function ExecutionStatusBadge({ status }: ExecutionStatusBadgeProps) {
  return (
    <span className={`${styles.badge} ${resolveClass(status)}`}>
      {status ?? "unknown"}
    </span>
  );
}
