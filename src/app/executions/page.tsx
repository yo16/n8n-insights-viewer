import { DbNotFoundError, getDb } from "@/lib/db/connection";
import {
  countExecutions,
  getExecutions,
  getWorkflowSummaries,
} from "@/lib/db/queries";
import { JST_OFFSET_MS } from "@/shared/datetime/jst";
import { EmptyState } from "@/components/ui/EmptyState";
import { ExecutionFilters } from "@/components/executions/ExecutionFilters";
import { ExecutionsTable } from "@/components/executions/ExecutionsTable";
import { Pagination } from "@/components/executions/Pagination";
import {
  parseExecutionsSearchParams,
  type RawSearchParams,
} from "@/components/executions/queryParams";
import styles from "./page.module.css";

/**
 * 画面4: 実行明細（`docs/design/frontend-design.md` 画面4）。
 *
 * ローカル蓄積した execution_entity の一覧をstatus/mode/workflowId/期間で絞り込み、
 * limit/offsetでページネーション表示する。全ページ共通でforce-dynamic必須
 * （`docs/design/app-architecture.md` §5）。
 */
export const dynamic = "force-dynamic";

const PAGE_SIZE = 20;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/**
 * JSTの日付文字列（YYYY-MM-DD）を、その日の境界のUTC ISO8601へ変換する。
 * `nextDay: true` の場合は翌日0時（=当日を含む排他的な上限）を返す。
 * 不正な形式はundefinedを返し、フィルタとしては無視される。
 */
function jstDateBoundaryToUtcIso(
  dateStr: string | undefined,
  nextDay: boolean,
): string | undefined {
  if (!dateStr || !DATE_PATTERN.test(dateStr)) return undefined;

  const [year, month, day] = dateStr.split("-").map(Number);
  const utcMs =
    Date.UTC(year, month - 1, day + (nextDay ? 1 : 0), 0, 0, 0) -
    JST_OFFSET_MS;
  const d = new Date(utcMs);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

type ExecutionsPageProps = {
  searchParams: Promise<RawSearchParams>;
};

export default async function ExecutionsPage({
  searchParams,
}: ExecutionsPageProps) {
  const rawSearchParams = await searchParams;
  const filter = parseExecutionsSearchParams(rawSearchParams);

  let db: ReturnType<typeof getDb>;
  try {
    db = getDb();
  } catch (err) {
    if (err instanceof DbNotFoundError) {
      return (
        <div className={styles.page}>
          <h1 className={styles.title}>実行明細</h1>
          <EmptyState message={err.message} />
        </div>
      );
    }
    throw err;
  }

  const sinceIso = jstDateBoundaryToUtcIso(filter.since, false);
  const untilIso = jstDateBoundaryToUtcIso(filter.until, true);

  const queryFilter = {
    status: filter.status,
    mode: filter.mode,
    workflowId: filter.workflowId,
    sinceIso,
    untilIso,
  };

  const offset = (filter.page - 1) * PAGE_SIZE;
  const rows = getExecutions(db, {
    ...queryFilter,
    limit: PAGE_SIZE,
    offset,
  });
  const totalCount = countExecutions(db, queryFilter);

  const workflows = getWorkflowSummaries(db);
  const workflowNames = new Map(
    workflows.map((w) => [w.workflowId, w.name] as const),
  );
  const workflowOptions = workflows.map((w) => ({
    id: w.workflowId,
    name: w.name,
  }));

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>実行明細</h1>
      <p className={styles.note}>
        直近7日を超える履歴も、同期のたびにローカルへ蓄積した分をあわせて表示しています。
        所要時間は開始〜終了（JST）の差分です。
      </p>

      <ExecutionFilters current={filter} workflowOptions={workflowOptions} />

      {totalCount === 0 ? (
        <EmptyState message="条件に一致する実行がありません" />
      ) : (
        <>
          <ExecutionsTable rows={rows} workflowNames={workflowNames} />
          <Pagination
            current={filter}
            totalCount={totalCount}
            pageSize={PAGE_SIZE}
          />
        </>
      )}
    </div>
  );
}
