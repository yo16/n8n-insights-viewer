import type { TrendDirection } from "@/lib/aggregation";
import styles from "./TrendIndicator.module.css";

const DIRECTION_ICON: Record<TrendDirection, string> = {
  increasing: "↑",
  flat: "→",
  decreasing: "↓",
};

const DIRECTION_LABEL: Record<TrendDirection, string> = {
  increasing: "増加",
  flat: "横ばい",
  decreasing: "減少",
};

export interface TrendIndicatorProps {
  /** 表示名（例: "MemAvailable"） */
  label: string;
  direction: TrendDirection;
  /** サンプル数が少ないため参考値扱いか（要件 §6.3） */
  isReference: boolean;
  sampleCount: number;
}

/**
 * トレンド（増加/横ばい/減少）の傾き表示。
 *
 * `docs/design/frontend-design.md` §3 `TrendIndicator` / 要件 §6.3。
 * メモリ系はスポットサンプルのためサンプル数が少ない場合に「参考値」を明示する。
 */
export function TrendIndicator({ label, direction, isReference, sampleCount }: TrendIndicatorProps) {
  return (
    <div className={styles.item}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>
        <span className={styles.icon} aria-hidden="true">
          {DIRECTION_ICON[direction]}
        </span>
        {DIRECTION_LABEL[direction]}
      </span>
      {isReference ? (
        <span className={styles.reference} title={`有効サンプル数 ${sampleCount} 件のため参考値です`}>
          参考値
        </span>
      ) : null}
    </div>
  );
}
