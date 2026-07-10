"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import styles from "./WorkflowsToolbar.module.css";

export type WorkflowsToolbarProps = {
  /** 現在「アクティブのみ」フィルタが有効か */
  activeOnly: boolean;
};

/**
 * 画面3（ワークフロー別一覧）の絞り込みUI（アクティブのみ表示）。
 *
 * フィルタ状態はURL searchParams（`active=1`）に反映し、Server Component側
 * （`app/workflows/page.tsx`）が再クエリする（`docs/design/frontend-design.md` 画面3）。
 */
export function WorkflowsToolbar({ activeOnly }: WorkflowsToolbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleToggle() {
    const params = new URLSearchParams(searchParams.toString());
    if (activeOnly) {
      params.delete("active");
    } else {
      params.set("active", "1");
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className={styles.toolbar}>
      <label className={styles.label}>
        <input
          type="checkbox"
          checked={activeOnly}
          onChange={handleToggle}
          className={styles.checkbox}
        />
        アクティブのみ表示
      </label>
    </div>
  );
}
