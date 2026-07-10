/**
 * n8n由来5テーブルのドメイン型。
 * 実体は src/shared/schemas 配下のzodスキーマから導出する（型とバリデーションの二重管理を避ける）。
 */
export type {
  InsightsByPeriodRow,
  InsightsMetadataRow,
  WorkflowEntityRow,
  WorkflowStatisticsRow,
  ExecutionEntityRow,
} from "../schemas";

/** insights_by_period.type の意味付け（0=time_saved_min / 1=runtime_ms / 2=success / 3=failure） */
export const InsightsMetricType = {
  TimeSavedMin: 0,
  RuntimeMs: 1,
  Success: 2,
  Failure: 3,
} as const;

export type InsightsMetricType =
  (typeof InsightsMetricType)[keyof typeof InsightsMetricType];

/** insights_by_period.periodUnit の意味付け（0=hour / 1=day / 2=week） */
export const InsightsPeriodUnit = {
  Hour: 0,
  Day: 1,
  Week: 2,
} as const;

export type InsightsPeriodUnit =
  (typeof InsightsPeriodUnit)[keyof typeof InsightsPeriodUnit];
