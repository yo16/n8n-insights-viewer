"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import styles from "./Nav.module.css";
import { NAV_LINKS } from "./nav-links";

/**
 * 全画面共通のナビゲーション。
 *
 * 現在のパスに応じてアクティブ表示（aria-current="page"）を行う
 * （docs/design/frontend-design.md §2 共通レイアウト）。
 */
export function Nav() {
  const pathname = usePathname();

  return (
    <nav className={styles.nav} aria-label="画面ナビゲーション">
      {NAV_LINKS.map((link) => {
        const isActive = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            className={isActive ? styles.linkActive : styles.link}
            aria-current={isActive ? "page" : undefined}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
