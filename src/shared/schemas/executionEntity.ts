import { z } from "zod";

/**
 * execution_entity（追記UPSERT・ローカルに履歴蓄積）の行スキーマ。
 * db-design.md §3.1 のカラム定義に準拠。
 *
 * ingestedAt は本DBに取り込んだ時刻（UTC, 監査用）で、同期CLIが付与するため必須。
 * data（実行の入出力JSON）は機微・巨大なため取り込まない（security-design.md）。
 */
export const ExecutionEntityRowSchema = z.object({
  id: z.number().int(),
  workflowId: z.string().nullable(),
  status: z.string().nullable(),
  mode: z.string().nullable(),
  startedAt: z.string().nullable(),
  stoppedAt: z.string().nullable(),
  createdAt: z.string().nullable(),
  finished: z.union([z.literal(0), z.literal(1)]).nullable(),
  ingestedAt: z.string().min(1),
});

export type ExecutionEntityRow = z.infer<typeof ExecutionEntityRowSchema>;
