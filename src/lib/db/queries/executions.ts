import "server-only";

import type Database from "better-sqlite3";

import type { ExecutionEntityRow } from "../../../shared/types";

/**
 * 画面4（実行明細）向けクエリ。
 * `docs/design/frontend-design.md` 画面4 / `docs/design/api-design.md` §6 に対応。
 *
 * execution_entity のフィルタ付き一覧（status/mode/期間/workflowId）を、
 * 件数上限・オフセット付きで返す。
 */

/** 画面4の絞り込み条件。 */
export interface ExecutionListFilter {
  /** 実行ステータス（'success' / 'error' 等）での絞り込み */
  status?: string;
  /** 実行モード（'trigger' / 'manual' / 'webhook' 等）での絞り込み */
  mode?: string;
  /** ワークフローIDでの絞り込み */
  workflowId?: string;
  /** startedAt の下限（UTC ISO8601, 含む） */
  sinceIso?: string;
  /** startedAt の上限（UTC ISO8601, 含まない） */
  untilIso?: string;
  /** 取得件数上限（既定100） */
  limit?: number;
  /** 取得開始オフセット（既定0） */
  offset?: number;
}

interface WhereClause {
  clause: string;
  params: Record<string, unknown>;
}

/**
 * フィルタ条件からWHERE句とバインドパラメータを組み立てる。
 * 値は必ずプレースホルダにバインドし、SQL文字列へ直接連結しない。
 */
function buildWhereClause(filter: ExecutionListFilter): WhereClause {
  const conditions: string[] = [];
  const params: Record<string, unknown> = {};

  if (filter.status !== undefined) {
    conditions.push("status = @status");
    params.status = filter.status;
  }
  if (filter.mode !== undefined) {
    conditions.push("mode = @mode");
    params.mode = filter.mode;
  }
  if (filter.workflowId !== undefined) {
    conditions.push("workflowId = @workflowId");
    params.workflowId = filter.workflowId;
  }
  if (filter.sinceIso !== undefined) {
    conditions.push("startedAt >= @sinceIso");
    params.sinceIso = filter.sinceIso;
  }
  if (filter.untilIso !== undefined) {
    conditions.push("startedAt < @untilIso");
    params.untilIso = filter.untilIso;
  }

  const clause =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  return { clause, params };
}

/**
 * フィルタ条件に合致する execution_entity を startedAt 降順（新しい順）で、
 * 件数上限・オフセット付きで取得する。
 */
export function getExecutions(
  db: Database.Database,
  filter: ExecutionListFilter = {},
): ExecutionEntityRow[] {
  const { clause, params } = buildWhereClause(filter);
  const limit = filter.limit ?? 100;
  const offset = filter.offset ?? 0;

  const sql = `
    SELECT id, workflowId, status, mode, startedAt, stoppedAt, createdAt, finished, ingestedAt
    FROM execution_entity
    ${clause}
    ORDER BY startedAt DESC
    LIMIT @limit OFFSET @offset
  `;

  return db
    .prepare<Record<string, unknown>, ExecutionEntityRow>(sql)
    .all({ ...params, limit, offset });
}

/**
 * フィルタ条件（limit/offsetを除く）に合致する execution_entity の件数を取得する。
 * ページネーションの総件数表示に使う。
 */
export function countExecutions(
  db: Database.Database,
  filter: ExecutionListFilter = {},
): number {
  const { clause, params } = buildWhereClause(filter);
  const sql = `SELECT COUNT(*) as count FROM execution_entity ${clause}`;

  const row = db
    .prepare<Record<string, unknown>, { count: number }>(sql)
    .get(params);
  return row?.count ?? 0;
}
