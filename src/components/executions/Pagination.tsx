import Link from "next/link";
import { buildExecutionsHref, type ExecutionsFilterState } from "./queryParams";
import styles from "./Pagination.module.css";

/**
 * 画面4（実行明細）のページネーション。
 *
 * `docs/design/frontend-design.md` 画面4: countExecutions + limit/offsetを
 * URLパラメータ（`page`）で表現する。リンク生成のみのため "use client" は不要。
 */

export type PaginationProps = {
  current: ExecutionsFilterState;
  totalCount: number;
  pageSize: number;
};

export function Pagination({ current, totalCount, pageSize }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages <= 1) return null;

  const page = Math.min(Math.max(current.page, 1), totalPages);
  const prevHref = buildExecutionsHref("/executions", current, {
    page: page - 1,
  });
  const nextHref = buildExecutionsHref("/executions", current, {
    page: page + 1,
  });

  return (
    <nav className={styles.pagination} aria-label="ページネーション">
      {page > 1 ? (
        <Link href={prevHref} className={styles.link}>
          前へ
        </Link>
      ) : (
        <span className={styles.linkDisabled} aria-disabled="true">
          前へ
        </span>
      )}
      <span className={styles.status}>
        {page} / {totalPages}ページ（全{totalCount}件）
      </span>
      {page < totalPages ? (
        <Link href={nextHref} className={styles.link}>
          次へ
        </Link>
      ) : (
        <span className={styles.linkDisabled} aria-disabled="true">
          次へ
        </span>
      )}
    </nav>
  );
}
