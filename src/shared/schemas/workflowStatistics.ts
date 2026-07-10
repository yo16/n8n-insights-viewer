import { z } from "zod";

/**
 * workflow_statistics（全置換）の行スキーマ。
 * db-design.md §3.1 のカラム定義に準拠。
 *
 * name: production_success / production_error / manual_success / manual_error 等
 * count: 生涯累計（pruneの影響を受けない）
 */
export const WorkflowStatisticsRowSchema = z.object({
  workflowId: z.string().min(1),
  name: z.string().min(1),
  count: z.number().int(),
  latestEvent: z.string().nullable(),
});

export type WorkflowStatisticsRow = z.infer<typeof WorkflowStatisticsRowSchema>;
