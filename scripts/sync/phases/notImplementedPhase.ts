/**
 * 未実装フェーズ（extract / ingest / collect-metrics）の骨格。
 *
 * これらのフェーズはBeadsタスク「shu」で実装される
 * （docs/design/data-sync-design.md §5 Phase 3-5）。
 * 本タスク（svo）では、フェーズ一覧・進捗イベント・sync_historyへの
 * 記録の骨格のみを用意し、到達した場合は明示的にエラー終了する。
 */

import type { SyncPhase } from "../progress";
import { emitPhaseError, emitPhaseStart } from "../progress";
import { NotImplementedPhaseError } from "../errors";

/**
 * 未実装フェーズに到達したことを進捗イベントで明示し、
 * {@link NotImplementedPhaseError} をスローして同期を中断する。
 */
export function runNotImplementedPhase(phase: SyncPhase): never {
  emitPhaseStart(phase);
  const error = new NotImplementedPhaseError(phase);
  emitPhaseError(phase, error.message);
  throw error;
}
