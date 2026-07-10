/**
 * validateフェーズ: 生コピー（本番DBスナップショット）に含まれる、
 * 取り込み対象5テーブルの想定カラム構成。
 *
 * `src/shared/schemas`（zod）を「期待するカラム名の唯一の情報源」として使い、
 * `sqlite_master`/`PRAGMA table_info` から得た実カラムと突合する
 * （docs/design/data-sync-design.md §5 Phase 2: validate）。
 *
 * n8n側テーブルは自動採番id列など、閲覧用スキーマに含めない列を追加で
 * 持ちうるため、**期待カラムが実カラムの部分集合であること**を検証する
 * （完全一致ではなく部分集合チェック。将来n8n側に列が増えても、
 * 利用中の列さえ揃っていれば動作を継続できるようにするため）。
 *
 * execution_entity.ingestedAt は同期CLIが取り込み時に付与する列であり、
 * n8n生コピー側には存在しないため、期待カラムから除外する。
 */

import { z } from "zod";

import {
  ExecutionEntityRowSchema,
  InsightsByPeriodRowSchema,
  InsightsMetadataRowSchema,
  WorkflowEntityRowSchema,
  WorkflowStatisticsRowSchema,
} from "../../src/shared/schemas";

/** 取り込み対象テーブルごとの期待スキーマ定義。 */
export interface TableSchemaExpectation {
  /** n8n生コピー側のテーブル名（物理名そのまま）。 */
  tableName: string;
  /** 期待するカラム名（このテーブルに存在すべき列。部分集合チェックに使う）。 */
  expectedColumns: string[];
}

function columnNames(
  schema: z.ZodObject<z.ZodRawShape>,
  exclude: readonly string[] = [],
): string[] {
  return Object.keys(schema.shape).filter((key) => !exclude.includes(key));
}

/**
 * 抽出対象5テーブルの期待スキーマ一覧
 * （docs/design/security-design.md §2 の「必要5テーブルのみ」に対応）。
 */
export const N8N_SOURCE_TABLE_EXPECTATIONS: readonly TableSchemaExpectation[] =
  [
    {
      tableName: "insights_by_period",
      expectedColumns: columnNames(InsightsByPeriodRowSchema),
    },
    {
      tableName: "insights_metadata",
      expectedColumns: columnNames(InsightsMetadataRowSchema),
    },
    {
      tableName: "workflow_entity",
      expectedColumns: columnNames(WorkflowEntityRowSchema),
    },
    {
      tableName: "workflow_statistics",
      expectedColumns: columnNames(WorkflowStatisticsRowSchema),
    },
    {
      tableName: "execution_entity",
      expectedColumns: columnNames(ExecutionEntityRowSchema, ["ingestedAt"]),
    },
  ];
