import "server-only";

/**
 * トレンド算出（api-design.md §4.1 / 要件 §6.3）。
 *
 * サンプル系列（欠測は null）から傾き（増加/横ばい/減少）を単回帰（最小二乗法）で
 * 算出する。OOMの予兆はMemAvailableの漸減として現れるため、主要指標（MemAvailable・
 * DBサイズ等）に添えて表示する用途を想定する。
 *
 * サンプル数が `trendSampleMin` 未満の場合は「参考値」（`isReference: true`）を立てる
 * （メモリ系は同期時のスポットサンプルのため、サンプルが少ないと信頼度が低い）。
 */

export type TrendDirection = "increasing" | "flat" | "decreasing";

export interface TrendResult {
  direction: TrendDirection;
  /** 単回帰の傾き（x=有効サンプルの出現順インデックス, y=値） */
  slope: number;
  /** 有効（非null）サンプル数 */
  sampleCount: number;
  /** サンプル数が trendSampleMin 未満のため参考値扱いか */
  isReference: boolean;
}

/**
 * 傾きの符号を「横ばい」とみなす相対許容誤差（サンプルの平均絶対値に対する割合）。
 * 値そのもののノイズに対して過敏に「増加/減少」と判定しないための独自の閾値
 * （要件・設計ドキュメントに具体的な数値指定は無いため、集計層の実装判断として設定）。
 */
const FLAT_EPSILON_RATIO = 0.01;

/**
 * サンプル系列（時系列順。欠測は null）からトレンドを算出する。
 * 有効サンプルが2点未満の場合は傾きを算出できないため `flat` とし、参考値扱いにする。
 */
export function computeTrend(
  samples: readonly (number | null | undefined)[],
  trendSampleMin: number,
): TrendResult {
  const valid: Array<{ x: number; y: number }> = [];
  samples.forEach((v, i) => {
    if (v !== null && v !== undefined && !Number.isNaN(v)) {
      valid.push({ x: i, y: v });
    }
  });

  const sampleCount = valid.length;
  const isReference = sampleCount < trendSampleMin;

  if (sampleCount < 2) {
    return { direction: "flat", slope: 0, sampleCount, isReference: true };
  }

  const n = valid.length;
  const meanX = valid.reduce((s, p) => s + p.x, 0) / n;
  const meanY = valid.reduce((s, p) => s + p.y, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (const p of valid) {
    numerator += (p.x - meanX) * (p.y - meanY);
    denominator += (p.x - meanX) ** 2;
  }
  const slope = denominator === 0 ? 0 : numerator / denominator;

  const meanAbsY = valid.reduce((s, p) => s + Math.abs(p.y), 0) / n;
  const epsilon = meanAbsY * FLAT_EPSILON_RATIO;

  let direction: TrendDirection;
  if (Math.abs(slope) <= epsilon) {
    direction = "flat";
  } else {
    direction = slope > 0 ? "increasing" : "decreasing";
  }

  return { direction, slope, sampleCount, isReference };
}
