import { z } from "zod";

/**
 * workflow_entity（全置換）の行スキーマ。
 * db-design.md §3.1 のカラム定義に準拠。
 *
 * active は SQLite上0/1の整数（真偽値）。credentials等の機微/重いカラムは取り込まない。
 */
export const WorkflowEntityRowSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  active: z.union([z.literal(0), z.literal(1)]),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

export type WorkflowEntityRow = z.infer<typeof WorkflowEntityRowSchema>;
