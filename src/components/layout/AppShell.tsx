import type { ReactNode } from "react";
import { Nav } from "./Nav";
import styles from "./AppShell.module.css";

/**
 * 全画面共通のレイアウトシェル（サイドナビ + メインの2カラム）。
 *
 * docs/design/styling-design.md §6 レイアウト /
 * docs/design/frontend-design.md §2 共通レイアウト。
 *
 * ヘッダの状態バッジ・最終同期表示は、データアクセス層（lib/db, lib/aggregation）が
 * 実装される後続タスクで、このシェルに追加する（本タスクはナビ・UI基盤のみ）。
 */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Nav />
      </aside>
      <main className={styles.main}>{children}</main>
    </div>
  );
}
