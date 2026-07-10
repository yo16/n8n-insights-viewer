/**
 * Phase 3: extract — 生コピーからのホワイトリスト抽出。
 *
 * docs/design/data-sync-design.md §5 Phase 3 / docs/design/security-design.md §2 準拠。
 *
 * - 生コピー（`data/raw/database.sqlite`）を read-only で開く
 * - 取り込み対象**5テーブルのみ**を、機微/不要カラムを含めないよう
 *   明示的なカラム指定（`SELECT *` を使わない）で読み出す
 * - 読み出した各行を `src/shared/schemas`（zod）で検証し、1行でも検証に
 *   失敗すれば {@link ExtractError} を投げて中断する（黙って壊れたデータを
 *   蓄積しない。ingestフェーズへは進まない）
 *
 * credentials_entity 等の機微テーブルはここで一切SELECTしない
 * （テーブル名をコードに一切登場させないことで、将来の変更時にも
 * 誤って読み出してしまうリスクを構造的に避ける）。
 */

import Database from "better-sqlite3";
import type { z } from "zod";

import {
  ExecutionEntityRowSchema,
  InsightsByPeriodRowSchema,
  InsightsMetadataRowSchema,
  WorkflowEntityRowSchema,
  WorkflowStatisticsRowSchema,
  type ExecutionEntityRow,
  type InsightsByPeriodRow,
  type InsightsMetadataRow,
  type WorkflowEntityRow,
  type WorkflowStatisticsRow,
} from "../../../src/shared/schemas";
import { ExtractError } from "../errors";
import {
  emitPhaseDone,
  emitPhaseError,
  emitPhaseProgress,
  emitPhaseStart,
} from "../progress";

/**
 * execution_entity は同期CLIが `ingestedAt` を付与するため、
 * 生コピーからの抽出時点ではまだ存在しない（ingestフェーズで付与する）。
 */
export type ExecutionEntityExtractRow = Omit<ExecutionEntityRow, "ingestedAt">;

const ExecutionEntityExtractSchema = ExecutionEntityRowSchema.omit({
  ingestedAt: true,
});

/** extractフェーズが読み出す5テーブル分のデータ。 */
export interface ExtractedData {
  insightsByPeriod: InsightsByPeriodRow[];
  insightsMetadata: InsightsMetadataRow[];
  workflowEntity: WorkflowEntityRow[];
  workflowStatistics: WorkflowStatisticsRow[];
  executionEntity: ExecutionEntityExtractRow[];
}

interface TableExtractSpec<T> {
  tableName: string;
  columns: readonly string[];
  schema: z.ZodType<T>;
}

/** 抽出対象5テーブルの仕様（テーブル名・ホワイトリストカラム・検証スキーマ）。 */
const EXTRACT_SPECS = {
  insightsByPeriod: {
    tableName: "insights_by_period",
    columns: ["metaId", "type", "value", "periodUnit", "periodStart"],
    schema: InsightsByPeriodRowSchema,
  } satisfies TableExtractSpec<InsightsByPeriodRow>,
  insightsMetadata: {
    tableName: "insights_metadata",
    columns: ["metaId", "workflowId", "workflowName", "projectName"],
    schema: InsightsMetadataRowSchema,
  } satisfies TableExtractSpec<InsightsMetadataRow>,
  workflowEntity: {
    tableName: "workflow_entity",
    columns: ["id", "name", "active", "createdAt", "updatedAt"],
    schema: WorkflowEntityRowSchema,
  } satisfies TableExtractSpec<WorkflowEntityRow>,
  workflowStatistics: {
    tableName: "workflow_statistics",
    columns: ["workflowId", "name", "count", "latestEvent"],
    schema: WorkflowStatisticsRowSchema,
  } satisfies TableExtractSpec<WorkflowStatisticsRow>,
  executionEntity: {
    tableName: "execution_entity",
    columns: [
      "id",
      "workflowId",
      "status",
      "mode",
      "startedAt",
      "stoppedAt",
      "createdAt",
      "finished",
    ],
    schema: ExecutionEntityExtractSchema,
  } satisfies TableExtractSpec<ExecutionEntityExtractRow>,
} as const;

/**
 * 1テーブル分を、ホワイトリストカラムのみでSELECTし、zodスキーマで検証する。
 * 1行でも検証に失敗すれば {@link ExtractError} を投げて中断する。
 */
function extractTable<T>(
  db: Database.Database,
  spec: TableExtractSpec<T>,
): T[] {
  emitPhaseProgress("extract", `${spec.tableName} を抽出中`);

  const columnList = spec.columns.join(", ");
  const rows = db
    .prepare(`SELECT ${columnList} FROM ${spec.tableName}`)
    .all() as Array<Record<string, unknown>>;

  const result: T[] = [];
  rows.forEach((row, index) => {
    const parsed = spec.schema.safeParse(row);
    if (!parsed.success) {
      const message = `テーブル "${spec.tableName}" の${index + 1}行目でスキーマ検証に失敗しました: ${parsed.error.message}`;
      emitPhaseError("extract", message);
      throw new ExtractError(message);
    }
    result.push(parsed.data);
  });

  return result;
}

/**
 * extractフェーズを実行する。
 *
 * @param rawDbPath 生コピー（database.sqlite）のローカルパス
 * @returns 検証済みの5テーブル分の抽出データ
 * @throws {ExtractError} DBを開けない場合、または1行でもスキーマ検証に失敗した場合
 */
export function runExtractPhase(rawDbPath: string): ExtractedData {
  emitPhaseStart("extract");

  let db: Database.Database | undefined;
  try {
    try {
      db = new Database(rawDbPath, { readonly: true, fileMustExist: true });
    } catch (err) {
      const message = `生コピーを開けませんでした: ${
        err instanceof Error ? err.message : String(err)
      }`;
      emitPhaseError("extract", message);
      throw new ExtractError(message);
    }

    const insightsByPeriod = extractTable(db, EXTRACT_SPECS.insightsByPeriod);
    const insightsMetadata = extractTable(db, EXTRACT_SPECS.insightsMetadata);
    const workflowEntity = extractTable(db, EXTRACT_SPECS.workflowEntity);
    const workflowStatistics = extractTable(
      db,
      EXTRACT_SPECS.workflowStatistics,
    );
    const executionEntity = extractTable(db, EXTRACT_SPECS.executionEntity);

    emitPhaseDone("extract");

    return {
      insightsByPeriod,
      insightsMetadata,
      workflowEntity,
      workflowStatistics,
      executionEntity,
    };
  } catch (err) {
    if (err instanceof ExtractError) {
      throw err;
    }
    const message = `生コピーからの抽出に失敗しました: ${
      err instanceof Error ? err.message : String(err)
    }`;
    emitPhaseError("extract", message);
    throw new ExtractError(message);
  } finally {
    db?.close();
  }
}
