/**
 * ダッシュボード（画面1）の前期間比表示用フォーマッタ。
 *
 * `docs/design/frontend-design.md` 画面1「前期間比」の表示専用ヘルパ。
 * サーバー側の集計（`src/lib/aggregation/summary.ts`）が返す差分値を
 * 「+12（+8.3%）」のような表示用文字列に整形するだけの見た目専用ロジック。
 * 好悪の意味づけ（増加が良い/悪い）は指標ごとに文脈が異なるため、ここでは行わない
 * （このディレクトリ専用の関数群のため、担当範囲の制約により `src/components/charts` には置かない）。
 */

/** 件数の差分（絶対値）と割合（比率, 0.083 = +8.3%）を「+12（+8.3%）」形式に整形する。 */
export function formatCountDelta(delta: number, deltaPct: number | null): string {
  const sign = delta > 0 ? "+" : delta < 0 ? "" : "±";
  const pctText =
    deltaPct === null ? "" : `（${deltaPct >= 0 ? "+" : ""}${(deltaPct * 100).toFixed(1)}%）`;
  return `${sign}${delta.toLocaleString("ja-JP")}${pctText}`;
}

/** ミリ秒の差分を「+12.3秒」等の可読な単位に整形する（前期間比の実行時間表示用）。 */
export function formatDurationDelta(deltaMs: number, deltaPct: number | null): string {
  const abs = Math.abs(deltaMs);
  const plusPrefix = deltaMs > 0 ? "+" : deltaMs === 0 ? "±" : "";
  let valueText: string;
  if (abs >= 60_000) {
    valueText = `${(deltaMs / 60_000).toFixed(1)}分`;
  } else if (abs >= 1000) {
    valueText = `${(deltaMs / 1000).toFixed(1)}秒`;
  } else {
    valueText = `${deltaMs}ms`;
  }
  const pctText =
    deltaPct === null ? "" : `（${deltaPct >= 0 ? "+" : ""}${(deltaPct * 100).toFixed(1)}%）`;
  return `${plusPrefix}${valueText}${pctText}`;
}

/** 成功率の差分（比率, -1〜1）を「+2.3pt」形式（パーセンテージポイント）に整形する。 */
export function formatRateDeltaPt(deltaRatio: number | null): string | undefined {
  if (deltaRatio === null) return undefined;
  const pt = deltaRatio * 100;
  const sign = pt > 0 ? "+" : pt < 0 ? "" : "±";
  return `${sign}${pt.toFixed(1)}pt`;
}
