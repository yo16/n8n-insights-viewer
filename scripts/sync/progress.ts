/**
 * 同期CLIの進捗イベント（JSON Lines）定義・出力ヘルパー。
 *
 * docs/design/data-sync-design.md §2.1 準拠:
 * - 1行1JSONでstdoutへ出力する
 * - `phase` は6フェーズ名 + `__result__`（最終結果）
 * - 人間可読メッセージ（デバッグ用の補足ログ）はstderrへ出してもよい
 *
 * 本来は `src/shared/sync/progress.ts` に置く設計（app-architecture.md §2）だが、
 * 本タスクの制約により src/shared への追加ができないため、scripts/sync 配下に
 * 定義する（実装完了報告の「独自判断点」参照）。
 */

import { z } from "zod";

/** 同期の6フェーズ名。 */
export const SYNC_PHASES = [
  "fetch",
  "validate",
  "extract",
  "ingest",
  "collect-metrics",
  "cleanup",
] as const;

export type SyncPhase = (typeof SYNC_PHASES)[number];

/** フェーズ内の進捗ステータス。 */
export const PHASE_STATUSES = ["start", "progress", "done", "error"] as const;
export type PhaseStatus = (typeof PHASE_STATUSES)[number];

/** 最終結果（`__result__`）のステータス。 */
export const RESULT_STATUSES = ["success", "failed", "aborted"] as const;
export type ResultStatus = (typeof RESULT_STATUSES)[number];

/** フェーズ進捗イベントのzodスキーマ。 */
export const PhaseProgressEventSchema = z.object({
  phase: z.enum(SYNC_PHASES),
  status: z.enum(PHASE_STATUSES),
  ts: z.string().optional(),
  message: z.string().optional(),
  pct: z.number().optional(),
});
export type PhaseProgressEvent = z.infer<typeof PhaseProgressEventSchema>;

/** 最終結果イベントのzodスキーマ。 */
export const ResultEventSchema = z.object({
  phase: z.literal("__result__"),
  status: z.enum(RESULT_STATUSES),
  ts: z.string().optional(),
  rowsIngested: z.record(z.string(), z.number()).optional(),
  error: z.string().optional(),
});
export type ResultEvent = z.infer<typeof ResultEventSchema>;

/** stdoutへ出力しうる進捗イベント全体のzodスキーマ。 */
export const SyncProgressEventSchema = z.union([
  PhaseProgressEventSchema,
  ResultEventSchema,
]);
export type SyncProgressEvent = z.infer<typeof SyncProgressEventSchema>;

/**
 * 進捗イベントを検証したうえでJSON Lines（1行1JSON）としてstdoutへ書き出す。
 */
export function emitProgress(event: SyncProgressEvent): void {
  const validated = SyncProgressEventSchema.parse(event);
  process.stdout.write(`${JSON.stringify(validated)}\n`);
}

function nowIso(): string {
  return new Date().toISOString();
}

/** フェーズ開始イベントを出力する。 */
export function emitPhaseStart(phase: SyncPhase): void {
  emitProgress({ phase, status: "start", ts: nowIso() });
}

/** フェーズ内の途中経過イベントを出力する。 */
export function emitPhaseProgress(
  phase: SyncPhase,
  message: string,
  pct?: number,
): void {
  emitProgress({ phase, status: "progress", ts: nowIso(), message, pct });
}

/** フェーズ正常終了イベントを出力する。 */
export function emitPhaseDone(phase: SyncPhase): void {
  emitProgress({ phase, status: "done", ts: nowIso() });
}

/** フェーズ失敗イベントを出力する。 */
export function emitPhaseError(phase: SyncPhase, message: string): void {
  emitProgress({ phase, status: "error", ts: nowIso(), message });
}

/** 最終結果イベントを出力する。 */
export function emitResult(
  status: ResultStatus,
  options?: { rowsIngested?: Record<string, number>; error?: string },
): void {
  emitProgress({
    phase: "__result__",
    status,
    ts: nowIso(),
    rowsIngested: options?.rowsIngested,
    error: options?.error,
  });
}

/**
 * 人間可読な補足メッセージをstderrへ出力する
 * （BI側のJSON Linesパースを汚染しないよう、進捗JSONとは分離する）。
 */
export function logHuman(message: string): void {
  process.stderr.write(`${message}\n`);
}
