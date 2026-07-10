import styles from "./StatusBadge.module.css";

export type Status = "normal" | "warning" | "danger";

const STATUS_LABEL: Record<Status, string> = {
  normal: "正常",
  warning: "注意",
  danger: "危険",
};

const STATUS_ICON: Record<Status, string> = {
  normal: "✓", // ✓
  warning: "⚠", // ⚠
  danger: "✕", // ✕
};

const STATUS_CLASS: Record<Status, string> = {
  normal: styles.normal,
  warning: styles.warning,
  danger: styles.danger,
};

export type StatusBadgeProps = {
  /** 状態（正常/注意/危険） */
  status: Status;
  /** 判定根拠（併記・tooltip表示）。例: 「MemAvailable 320MB」 */
  reason?: string;
};

/**
 * 正常/注意/危険の3段状態バッジ。
 *
 * 色のみに依存せず、アイコン + テキストラベルを併記する
 * （docs/design/styling-design.md §2.1 / §4）。
 * 判定根拠は `reason` があれば併記し、`title` 属性でtooltip表示する
 * （docs/design/frontend-design.md §3 StatusBadge）。
 */
export function StatusBadge({ status, reason }: StatusBadgeProps) {
  const label = STATUS_LABEL[status];

  return (
    <span
      className={`${styles.badge} ${STATUS_CLASS[status]}`}
      role="status"
      title={reason}
    >
      <span className={styles.icon} aria-hidden="true">
        {STATUS_ICON[status]}
      </span>
      <span>{label}</span>
      {reason ? <span className={styles.reason}>（{reason}）</span> : null}
    </span>
  );
}
