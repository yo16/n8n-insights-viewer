import { z } from "zod";

/**
 * insights_metadata（全置換）の行スキーマ。
 * db-design.md §3.1 のカラム定義に準拠。
 *
 * ワークフロー削除後は workflowId が NULL になりうる（ON DELETE SET NULL）が、
 * workflowName は削除後も残る想定。
 */
export const InsightsMetadataRowSchema = z.object({
  metaId: z.number().int(),
  workflowId: z.string().nullable(),
  workflowName: z.string().nullable(),
  projectName: z.string().nullable(),
});

export type InsightsMetadataRow = z.infer<typeof InsightsMetadataRowSchema>;
