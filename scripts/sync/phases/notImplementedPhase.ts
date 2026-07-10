/**
 * 未実装フェーズ（collect-metrics）の骨格。
 *
 * このフェーズは後続タスク「8k8」で実装される
 * （docs/design/data-sync-design.md §5 Phase 5）。
 * 本タスク（shu）では、フェーズ一覧・進捗イベント・sync_historyへの
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
