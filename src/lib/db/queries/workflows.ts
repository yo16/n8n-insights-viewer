import "server-only";

import type Database from "better-sqlite3";

/**
 * 画面3（ワークフロー別一覧）向けクエリ。
 * `docs/design/frontend-design.md` 画面3 / `docs/design/api-design.md` §6 に対応。
 *
 * workflow_entity + insights_by_period集計 + workflow_statistics を結合し、
 * ワークフロー別の集計一覧を返す。
 */

/** ワークフロー別集計一覧の1行。 */
export interface WorkflowSummaryRow {
  workflowId: string;
  name: string;
  /** 0/1（真偽値としてのアクティブ状態） */
  active: 0 | 1;
  /** insights_by_period(type=2) の合計 */
  successCount: number;
  /** insights_by_period(type=3) の合計 */
  failureCount: number;
  /** insights_by_period(type=1) の合計 */
  totalRuntimeMs: number;
  /** successCount + failureCount */
  executionCount: number;
  /** workflow_statistics.count の合計（生涯累計。pruneの影響を受けない） */
  statisticsTotalCount: number;
}

/** 画面3の絞り込み条件。 */
export interface WorkflowSummaryFilter {
  /** true の場合 active=1 のワークフローのみに絞り込む */
  activeOnly?: boolean;
}

/**
 * ワークフローごとの実行数・成功率算出用の集計・累計値（workflow_statistics）を結合して返す。
 * ソートは呼び出し側（Server Component）がURL searchParamsに応じて行う想定のため、
 * ここでは name 昇順の既定ソートのみ行う。
 */
export function getWorkflowSummaries(
  db: Database.Database,
  filter: WorkflowSummaryFilter = {},
): WorkflowSummaryRow[] {
  const activeOnly = filter.activeOnly ? 1 : 0;

  const sql = `
    SELECT
      we.id as workflowId,
      we.name as name,
      we.active as active,
      COALESCE(ins.successCount, 0) as successCount,
      COALESCE(ins.failureCount, 0) as failureCount,
      COALESCE(ins.totalRuntimeMs, 0) as totalRuntimeMs,
      COALESCE(ins.successCount, 0) + COALESCE(ins.failureCount, 0) as executionCount,
      COALESCE(ws.statisticsTotalCount, 0) as statisticsTotalCount
    FROM workflow_entity we
    LEFT JOIN (
      SELECT
        im.workflowId as workflowId,
        SUM(CASE WHEN ibp.type = 2 THEN ibp.value ELSE 0 END) as successCount,
        SUM(CASE WHEN ibp.type = 3 THEN ibp.value ELSE 0 END) as failureCount,
        SUM(CASE WHEN ibp.type = 1 THEN ibp.value ELSE 0 END) as totalRuntimeMs
      FROM insights_by_period ibp
      JOIN insights_metadata im ON im.metaId = ibp.metaId
      WHERE im.workflowId IS NOT NULL
      GROUP BY im.workflowId
    ) ins ON ins.workflowId = we.id
    LEFT JOIN (
      SELECT workflowId, SUM(count) as statisticsTotalCount
      FROM workflow_statistics
      GROUP BY workflowId
    ) ws ON ws.workflowId = we.id
    WHERE (@activeOnly = 0 OR we.active = 1)
    ORDER BY we.name ASC
  `;

  return db
    .prepare<Record<string, unknown>, WorkflowSummaryRow>(sql)
    .all({ activeOnly });
}
