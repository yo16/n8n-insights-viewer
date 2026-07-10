import type { ReactNode } from "react";
import styles from "./EmptyState.module.css";

export type EmptyStateProps = {
  /** 見出し（省略可） */
  title?: string;
  /** 案内メッセージ。例:「まだ同期されていません。npm run sync を実行してください」 */
  message: string;
  /** 同期画面へのリンク等の追加アクション */
  children?: ReactNode;
};

/**
 * データ未同期・該当データなし等の空状態を案内するコンポーネント
 * （docs/design/frontend-design.md §3, §7 空状態・エラー状態）。
 */
export function EmptyState({ title, message, children }: EmptyStateProps) {
  return (
    <div className={styles.container} role="status">
      {title ? <p className={styles.title}>{title}</p> : null}
      <p className={styles.message}>{message}</p>
      {children ? <div className={styles.actions}>{children}</div> : null}
    </div>
  );
}
