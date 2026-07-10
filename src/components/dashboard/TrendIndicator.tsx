import type { TrendDirection } from "@/lib/aggregation/trend";
import styles from "./TrendIndicator.module.css";

const DIRECTION_ICON: Record<TrendDirection, string> = {
  increasing: "↑",
  flat: "→",
  decreasing: "↓",
};

const DIRECTION_LABEL: Record<TrendDirection, string> = {
  increasing: "増加傾向",
  flat: "横ばい",
  decreasing: "減少傾向",
};

export type TrendIndicatorProps = {
  /** 指標ラベル（例: MemAvailable） */
  label: string;
  /** 直近値の表示用文字列（例: "320 MB"）。無い場合は非表示 */
  currentValueLabel?: string;
  direction: TrendDirection;
  /** サンプル数不足のため参考値扱いか（`docs/requirements.md` §6.3） */
  isReference: boolean;
  /** 有効サンプル数 */
  sampleCount: number;
};

/**
 * MemAvailable・DBサイズ等のトレンド（増加/横ばい/減少）表示。
 *
 * `docs/design/frontend-design.md` 画面1 の `TrendIndicator`（参考値フラグ対応）に対応する
 * 表示専用コンポーネント。傾きの算出はServer側（`src/lib/aggregation/trend.ts`）が担う。
 * 指標ごとに増加/減少の良し悪しの意味が異なる（MemAvailableは減少が悪化、DBサイズは増加が悪化）ため、
 * このコンポーネント自体は色による良否判定を行わず、方向と参考値フラグの提示に徹する
 * （良否の判定は `StatusBadge`（状態評価）が担う）。
 */
export function TrendIndicator({
  label,
  currentValueLabel,
  direction,
  isReference,
  sampleCount,
}: TrendIndicatorProps) {
  return (
    <div className={styles.trend}>
      <span className={styles.label}>{label}</span>
      {currentValueLabel ? <span className={styles.value}>{currentValueLabel}</span> : null}
      <span className={styles.direction}>
        <span aria-hidden="true">{DIRECTION_ICON[direction]}</span>
        {DIRECTION_LABEL[direction]}
      </span>
      {isReference ? (
        <span className={styles.reference}>参考値（サンプル{sampleCount}件）</span>
      ) : null}
    </div>
  );
}
