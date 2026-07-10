/**
 * 画面4（実行明細）表示用のフォーマッタ。
 *
 * `docs/design/frontend-design.md` 画面4: 「所要時間はstoppedAt-startedAtをJSTで表示」に対応。
 * 日時のJST変換自体は `src/shared/datetime/jst.ts` に委譲し、ここでは
 * null安全な表示文字列への変換のみを担う。
 */
import { formatJstDateTime } from "@/shared/datetime/jst";

/** UTCのISO8601日時をJSTの表示用文字列へ変換する。null・不正値は "—" を返す。 */
export function formatExecutionDateTime(iso: string | null): string {
  if (!iso) return "—";
  try {
    return formatJstDateTime(iso);
  } catch {
    return "—";
  }
}

/**
 * 所要時間（stoppedAt - startedAt）を表示用文字列へ変換する。
 * 未終了（stoppedAtがnull）・不正値の場合は "—" を返す。
 */
export function formatExecutionDuration(
  startedAt: string | null,
  stoppedAt: string | null,
): string {
  if (!startedAt || !stoppedAt) return "—";

  const startMs = new Date(startedAt).getTime();
  const stopMs = new Date(stoppedAt).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(stopMs) || stopMs < startMs) {
    return "—";
  }

  const diffMs = stopMs - startMs;
  if (diffMs < 1000) return `${diffMs}ms`;

  const totalSeconds = diffMs / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}秒`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.round(totalSeconds % 60);
  return `${minutes}分${seconds}秒`;
}
