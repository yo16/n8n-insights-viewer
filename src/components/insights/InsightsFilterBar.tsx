"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RANGE_OPTIONS, type RangeKey } from "@/app/insights/rangeOptions";
import styles from "./InsightsFilterBar.module.css";

export interface InsightsFilterBarWorkflowOption {
  id: string;
  name: string;
}

export interface InsightsFilterBarProps {
  /** 現在選択中の期間プリセット */
  range: RangeKey;
  /** 現在選択中のワークフローID（省略時は「すべて」） */
  workflowId?: string;
  /** 絞り込み選択肢に表示するワークフロー一覧 */
  workflows: InsightsFilterBarWorkflowOption[];
}

/**
 * 画面2（Insights推移）のフィルタUI（期間プリセット・ワークフロー絞り込み）。
 *
 * `docs/design/frontend-design.md` 画面2「フィルタ（URL searchParams・サーバー再クエリ）」に対応。
 * 選択値はクライアント側でJSフィルタせず、URL searchParams を更新して
 * Server Component（`app/insights/page.tsx`）への再リクエストをトリガする。
 */
export function InsightsFilterBar({ range, workflowId, workflows }: InsightsFilterBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return (
    <div className={styles.bar}>
      <div className={styles.field}>
        <label htmlFor="insights-range-select">期間</label>
        <select
          id="insights-range-select"
          className={styles.select}
          value={range}
          onChange={(e) => updateParam("range", e.target.value)}
        >
          {RANGE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.field}>
        <label htmlFor="insights-workflow-select">ワークフロー</label>
        <select
          id="insights-workflow-select"
          className={styles.select}
          value={workflowId ?? ""}
          onChange={(e) => updateParam("workflowId", e.target.value)}
        >
          <option value="">すべて</option>
          {workflows.map((wf) => (
            <option key={wf.id} value={wf.id}>
              {wf.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
