/**
 * week粒度由来の近似点に関する注意書き（設計レビュー申し送り事項）。
 *
 * `normalizeInsightsToDaily` は week粒度（1週間分の集計）を1つの日次点にまとめて
 * 近似表示する（`docs/design/frontend-design.md` 画面2「粒度混在はdayに正規化」）。
 * そのため week由来の点は、隣接するhour/day由来の日次点（1日分の値）と比べて
 * 値が7倍程度大きく見えることがある。`TimeSeriesChart` の `isApprox` 注記
 * （UTC近似値）だけでは「値の大きさ自体が近似の産物である」ことまでは伝わらないため、
 * このチャート固有の補足注記として別途表示する。
 */
export function WeekApproxFootnote() {
  return (
    <p>
      さらに古い期間（週次集計から変換した点）は、1週間分の値を1日分の点としてまとめて
      表示しています。そのため、隣接する日次の点より値が大きく見える場合があります。
    </p>
  );
}
