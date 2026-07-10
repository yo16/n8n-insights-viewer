/**
 * 画面4（実行明細）のフィルタ・ページネーション状態とURL searchParamsの相互変換。
 *
 * `docs/design/frontend-design.md` 画面4 / `docs/design/app-architecture.md` §4, §6 に対応:
 * フィルタ操作はURL searchParamsを更新しサーバーが再クエリする。
 * Server Component（page.tsx）とClient Component（ExecutionFilters, Pagination）の
 * 双方から使うため、Next.js非依存の純粋関数として実装する。
 */

/** Server Componentが受け取る生のsearchParams（Next.jsのPageProps由来）。 */
export type RawSearchParams = Record<string, string | string[] | undefined>;

/** 画面4のフィルタ・ページネーション状態。 */
export type ExecutionsFilterState = {
  /** 実行ステータス（'success' / 'error' 等）。未指定なら全件 */
  status?: string;
  /** 実行モード（'trigger' / 'manual' 等）。未指定なら全件 */
  mode?: string;
  /** ワークフローIDでの絞り込み。未指定なら全件 */
  workflowId?: string;
  /** 期間の開始（JSTの日付文字列 YYYY-MM-DD、以降を含む） */
  since?: string;
  /** 期間の終了（JSTの日付文字列 YYYY-MM-DD、当日を含む） */
  until?: string;
  /** ページ番号（1始まり） */
  page: number;
};

function firstValue(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v ? v : undefined;
}

/** URL searchParamsから画面4のフィルタ・ページネーション状態を組み立てる。 */
export function parseExecutionsSearchParams(
  sp: RawSearchParams,
): ExecutionsFilterState {
  const pageRaw = firstValue(sp.page);
  const pageNum = pageRaw ? Number(pageRaw) : 1;

  return {
    status: firstValue(sp.status),
    mode: firstValue(sp.mode),
    workflowId: firstValue(sp.workflowId),
    since: firstValue(sp.since),
    until: firstValue(sp.until),
    page: Number.isFinite(pageNum) && pageNum > 0 ? Math.floor(pageNum) : 1,
  };
}

/**
 * 現在のフィルタ状態へoverridesを適用したURLを組み立てる。
 * フィルタ変更時は原則ページを1へリセットする想定（呼び出し側でoverrides.pageを指定）。
 */
export function buildExecutionsHref(
  base: string,
  current: ExecutionsFilterState,
  overrides: Partial<ExecutionsFilterState>,
): string {
  const merged: ExecutionsFilterState = { ...current, ...overrides };
  const params = new URLSearchParams();

  if (merged.status) params.set("status", merged.status);
  if (merged.mode) params.set("mode", merged.mode);
  if (merged.workflowId) params.set("workflowId", merged.workflowId);
  if (merged.since) params.set("since", merged.since);
  if (merged.until) params.set("until", merged.until);
  if (merged.page > 1) params.set("page", String(merged.page));

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}
