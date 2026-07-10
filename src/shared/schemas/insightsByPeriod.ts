import { z } from "zod";

/**
 * insights_by_period（主データソース・全置換）の行スキーマ。
 * db-design.md §3.1 のカラム定義に準拠。
 *
 * - type: 0=time_saved_min / 1=runtime_ms / 2=success / 3=failure
 * - periodUnit: 0=hour / 1=day / 2=week
 * - periodStart: 期間開始（UTC, ISO8601文字列）
 */
export const InsightsByPeriodRowSchema = z.object({
  metaId: z.number().int(),
  type: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  value: z.number().int(),
  periodUnit: z.union([z.literal(0), z.literal(1), z.literal(2)]),
  periodStart: z.string().min(1),
});

export type InsightsByPeriodRow = z.infer<typeof InsightsByPeriodRowSchema>;
