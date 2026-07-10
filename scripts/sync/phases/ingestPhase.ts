/**
 * Phase 4: ingest — 蓄積DBへの取り込み。
 *
 * docs/design/data-sync-design.md §5 Phase 4 / docs/design/db-design.md §4 準拠。
 *
 * - 全置換テーブル（insights_by_period / insights_metadata / workflow_entity /
 *   workflow_statistics）: DELETE→INSERTで置換する
 * - 追記UPSERTテーブル（execution_entity）: `id` をキーに
 *   `INSERT ... ON CONFLICT DO UPDATE` し、`ingestedAt` を付与する
 *   （7日でpruneされる本番の実行明細を、ローカルに永続蓄積するため）
 *
 * **独自判断**: db-design.md §4.1は「全置換テーブルは各々を単一トランザクションで」
 * と読めるが、本実装では ingest フェーズ全体（4つの全置換 + execution_entity の
 * UPSERT）を**1つの外側トランザクション**で包む。個々のテーブル単位のトランザクションを
 * 積み重ねるより強い一貫性が得られ（途中の1テーブルだけ失敗した場合でも全体を
 * ロールバックでき、"部分的に古いテーブルと新しいテーブルが混在した状態" を防げる）、
 * かつ「トランザクション単位でロールバックし、部分的な壊れたデータを残さない」
 * （data-sync-design.md §4.4 失敗時）という要求を包含する。
 */

import type Database from "better-sqlite3";

import type { ExtractedData } from "./extractPhase";
import { emitPhaseDone, emitPhaseProgress, emitPhaseStart } from "../progress";

/** ingestフェーズの結果（テーブル名 → 取り込み件数）。sync_history.rows_ingested_json に記録する。 */
export interface IngestResult {
  rowsIngested: Record<string, number>;
}

/**
 * 全置換テーブルを `DELETE FROM t` → `INSERT` で置換する。
 * 行が0件の場合はDELETEのみ行う（INSERTはスキップ）。
 */
function replaceTable(
  db: Database.Database,
  tableName: string,
  columns: readonly string[],
  rows: ReadonlyArray<Record<string, unknown>>,
): number {
  db.prepare(`DELETE FROM ${tableName}`).run();

  if (rows.length === 0) {
    return 0;
  }

  const placeholders = columns.map(() => "?").join(", ");
  const insert = db.prepare(
    `INSERT INTO ${tableName} (${columns.join(", ")}) VALUES (${placeholders})`,
  );

  for (const row of rows) {
    insert.run(...columns.map((column) => row[column] ?? null));
  }

  return rows.length;
}

/**
 * execution_entity を `id` キーでUPSERTする。`ingestedAt` は同期時刻を付与する。
 * 本番側で7日/5000件によりpruneされた行も、ローカルには残り続ける
 * （UPSERTのため既存行を削除しない。db-design.md §3.1 execution_entity）。
 */
function upsertExecutionEntity(
  db: Database.Database,
  rows: ReadonlyArray<ExtractedData["executionEntity"][number]>,
  ingestedAt: string,
): number {
  const upsert = db.prepare(`
    INSERT INTO execution_entity
      (id, workflowId, status, mode, startedAt, stoppedAt, createdAt, finished, ingestedAt)
    VALUES
      (@id, @workflowId, @status, @mode, @startedAt, @stoppedAt, @createdAt, @finished, @ingestedAt)
    ON CONFLICT(id) DO UPDATE SET
      workflowId = excluded.workflowId,
      status     = excluded.status,
      mode       = excluded.mode,
      startedAt  = excluded.startedAt,
      stoppedAt  = excluded.stoppedAt,
      createdAt  = excluded.createdAt,
      finished   = excluded.finished,
      ingestedAt = excluded.ingestedAt
  `);

  for (const row of rows) {
    upsert.run({ ...row, ingestedAt });
  }

  return rows.length;
}

/**
 * ingestフェーズを実行する。
 *
 * @param db 読み書き可能で開かれた蓄積DB（`syncHistory.openAccumulationDbForWrite` 参照）
 * @param extracted extractフェーズで検証済みの5テーブル分のデータ
 * @returns テーブル名 → 取り込み件数
 */
export function runIngestPhase(
  db: Database.Database,
  extracted: ExtractedData,
): IngestResult {
  emitPhaseStart("ingest");

  const ingestedAt = new Date().toISOString();
  const rowsIngested: Record<string, number> = {};

  const applyIngest = db.transaction(() => {
    rowsIngested.insights_by_period = replaceTable(
      db,
      "insights_by_period",
      ["metaId", "type", "value", "periodUnit", "periodStart"],
      extracted.insightsByPeriod,
    );

    rowsIngested.insights_metadata = replaceTable(
      db,
      "insights_metadata",
      ["metaId", "workflowId", "workflowName", "projectName"],
      extracted.insightsMetadata,
    );

    rowsIngested.workflow_entity = replaceTable(
      db,
      "workflow_entity",
      ["id", "name", "active", "createdAt", "updatedAt"],
      extracted.workflowEntity,
    );

    rowsIngested.workflow_statistics = replaceTable(
      db,
      "workflow_statistics",
      ["workflowId", "name", "count", "latestEvent"],
      extracted.workflowStatistics,
    );

    rowsIngested.execution_entity = upsertExecutionEntity(
      db,
      extracted.executionEntity,
      ingestedAt,
    );
  });

  applyIngest();

  emitPhaseProgress(
    "ingest",
    `取り込み件数: ${JSON.stringify(rowsIngested)}`,
  );
  emitPhaseDone("ingest");

  return { rowsIngested };
}
