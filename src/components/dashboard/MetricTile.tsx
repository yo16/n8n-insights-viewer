import styles from "./MetricTile.module.css";

export type MetricTileProps = {
  /** 指標ラベル（例: 総実行数） */
  label: string;
  /** 表示用に整形済みの値（例: "1,234"） */
  value: string;
  /** 前期間比の表示用テキスト（例: "+12（+8.3%）"）。無い場合は非表示 */
  delta?: string;
};

/**
 * ダッシュボードのサマリ数値タイル（総実行数・成功率・失敗数・総実行時間）。
 *
 * `docs/design/frontend-design.md` 画面1 の `MetricCard` に対応する表示専用コンポーネント。
 * 値の算出・前期間比の計算はServer側（`src/lib/aggregation/summary.ts`）が担い、
 * ここでは整形済みの文字列を受け取って表示するだけに徹する。
 */
export function MetricTile({ label, value, delta }: MetricTileProps) {
  return (
    <div className={styles.tile}>
      <p className={styles.label}>{label}</p>
      <p className={styles.value}>{value}</p>
      {delta ? <p className={styles.delta}>前期間比 {delta}</p> : null}
    </div>
  );
}
