/**
 * 画面2（Insights推移）の期間プリセット定義。
 *
 * `docs/design/frontend-design.md` 画面2「フィルタ（URL searchParams・サーバー再クエリ）」に対応。
 * Server Component（page.tsx）・Client Component（InsightsFilterBar）双方から参照するため、
 * `server-only` に依存しない純粋な定義のみをこのファイルに置く
 * （`viewModel.ts` は server-only 前提のロジックを持つため分離している）。
 */

export type RangeKey = "7d" | "30d" | "90d" | "all";

export const DEFAULT_RANGE: RangeKey = "30d";

export const RANGE_OPTIONS: ReadonlyArray<{ value: RangeKey; label: string }> = [
  { value: "7d", label: "直近7日" },
  { value: "30d", label: "直近30日" },
  { value: "90d", label: "直近90日" },
  { value: "all", label: "全期間" },
];

/** 日数プリセット（"all" を除く）。 */
export const RANGE_DAYS: Record<Exclude<RangeKey, "all">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/** URL searchParams の `range` 値を検証し、不正/未指定なら既定値にフォールバックする。 */
export function parseRangeParam(value: string | undefined): RangeKey {
  if (value === "7d" || value === "30d" || value === "90d" || value === "all") {
    return value;
  }
  return DEFAULT_RANGE;
}
