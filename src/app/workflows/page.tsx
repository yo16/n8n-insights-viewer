import Link from "next/link";
import { DbNotFoundError, getDb } from "@/lib/db/connection";
import { getWorkflowSummaries } from "@/lib/db/queries/workflows";
import { EmptyState } from "@/components/ui/EmptyState";
import { WorkflowsToolbar } from "@/components/workflows/WorkflowsToolbar";
import { WorkflowsTable } from "@/components/workflows/WorkflowsTable";
import { sortWorkflowRows, withDerivedMetrics } from "@/components/workflows/sortWorkflows";
import {
  DEFAULT_SORT_KEY,
  DEFAULT_SORT_ORDER,
  SORT_KEYS,
  type SortKey,
  type SortOrder,
} from "@/components/workflows/types";
import styles from "./page.module.css";

/**
 * 画面3（ワークフロー別一覧）。
 *
 * `docs/design/frontend-design.md` 画面3 / `docs/requirements.md` §6.1-3。
 *
 * DBはリクエストの都度読み直す（`force-dynamic`）。フィルタ（アクティブのみ）・
 * ソートはURL searchParams経由で受け取り、ソートはこのServer Component側で適用する。
 */
export const dynamic = "force-dynamic";

type RawSearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseActiveOnly(params: RawSearchParams): boolean {
  const v = firstValue(params.active);
  return v === "1" || v === "true";
}

function parseSortKey(params: RawSearchParams): SortKey {
  const v = firstValue(params.sort);
  return (SORT_KEYS as readonly string[]).includes(v ?? "")
    ? (v as SortKey)
    : DEFAULT_SORT_KEY;
}

function parseSortOrder(params: RawSearchParams): SortOrder {
  const v = firstValue(params.order);
  return v === "desc" ? "desc" : DEFAULT_SORT_ORDER;
}

export default async function WorkflowsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const activeOnly = parseActiveOnly(params);
  const sortKey = parseSortKey(params);
  const order = parseSortOrder(params);

  let dbNotFound = false;
  let rows = withDerivedMetrics([]);

  try {
    const db = getDb();
    rows = withDerivedMetrics(getWorkflowSummaries(db, { activeOnly }));
  } catch (err) {
    if (err instanceof DbNotFoundError) {
      dbNotFound = true;
    } else {
      throw err;
    }
  }

  if (dbNotFound) {
    return (
      <div className={styles.page}>
        <h1 className={styles.heading}>ワークフロー別一覧</h1>
        <EmptyState message="まだ同期されていません。npm run sync を実行するか、同期画面から実行してください。">
          <Link href="/sync">同期画面へ</Link>
        </EmptyState>
      </div>
    );
  }

  const sortedRows = sortWorkflowRows(rows, sortKey, order);

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>ワークフロー別一覧</h1>
      <WorkflowsToolbar activeOnly={activeOnly} />
      {sortedRows.length === 0 ? (
        <EmptyState message="条件に一致するデータがありません。" />
      ) : (
        <WorkflowsTable rows={sortedRows} sortKey={sortKey} order={order} />
      )}
    </div>
  );
}
