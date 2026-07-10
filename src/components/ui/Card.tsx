import type { ReactNode } from "react";
import styles from "./Card.module.css";

export type CardProps = {
  /** カード見出し（省略可） */
  title?: string;
  children: ReactNode;
  className?: string;
};

/**
 * ダッシュボードのサマリタイル等の入れ物となる汎用カード
 * （docs/design/frontend-design.md §3 共通コンポーネント）。
 */
export function Card({ title, children, className }: CardProps) {
  return (
    <div className={className ? `${styles.card} ${className}` : styles.card}>
      {title ? <h3 className={styles.title}>{title}</h3> : null}
      {children}
    </div>
  );
}
