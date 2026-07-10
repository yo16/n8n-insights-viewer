import { Sparkline, type SparklinePoint } from "@/components/charts/Sparkline";
import { formatBytes } from "@/components/charts/format";
import styles from "./MachineSparklines.module.css";

export type MachineSparklinesProps = {
  memAvailableSeries: SparklinePoint[];
  swapUsedSeries: SparklinePoint[];
};

function latestValue(series: SparklinePoint[]): number | null {
  for (let i = series.length - 1; i >= 0; i -= 1) {
    const v = series[i].value;
    if (v !== null) return v;
  }
  return null;
}

/**
 * ダッシュボードの「直近のマシン負荷スパークライン」（MemAvailable / スワップ使用量）。
 *
 * `docs/design/frontend-design.md` 画面1 の `Sparkline`（メモリ/swap）に対応する表示専用コンポーネント。
 * データ整形（欠測明示・KB→byte換算）はServer側（`src/app/page.tsx`）で行い、
 * ここでは整形済みの系列を受け取って描画するだけに徹する。
 */
export function MachineSparklines({
  memAvailableSeries,
  swapUsedSeries,
}: MachineSparklinesProps) {
  const hasData = memAvailableSeries.length > 0;

  if (!hasData) {
    return <p className={styles.empty}>マシン負荷データがありません。</p>;
  }

  const latestMemBytes = latestValue(memAvailableSeries);
  const latestSwapBytes = latestValue(swapUsedSeries);

  return (
    <div className={styles.grid}>
      <div className={styles.item}>
        <div className={styles.itemHeader}>
          <span className={styles.itemLabel}>MemAvailable</span>
          <span className={styles.itemValue}>
            {latestMemBytes !== null ? formatBytes(latestMemBytes) : "-"}
          </span>
        </div>
        <Sparkline
          data={memAvailableSeries}
          color="var(--series-memory)"
          unit="bytes"
          name="MemAvailable"
          ariaLabel="MemAvailableの直近推移"
        />
      </div>
      <div className={styles.item}>
        <div className={styles.itemHeader}>
          <span className={styles.itemLabel}>スワップ使用量</span>
          <span className={styles.itemValue}>
            {latestSwapBytes !== null ? formatBytes(latestSwapBytes) : "-"}
          </span>
        </div>
        <Sparkline
          data={swapUsedSeries}
          color="var(--series-swap)"
          unit="bytes"
          name="スワップ使用量"
          ariaLabel="スワップ使用量の直近推移"
        />
      </div>
    </div>
  );
}
