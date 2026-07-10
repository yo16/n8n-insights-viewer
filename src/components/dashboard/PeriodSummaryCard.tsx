import { Card } from "@/components/ui/Card";
import { MetricTile, type MetricTileProps } from "./MetricTile";
import styles from "./PeriodSummaryCard.module.css";

export type PeriodSummaryCardProps = {
  /** 期間ラベル（例: "直近7日"） */
  title: string;
  metrics: MetricTileProps[];
};

/**
 * 期間サマリ（直近7日/30日）のタイル群をまとめるカード。
 *
 * `docs/design/frontend-design.md` 画面1「直近7日/30日のサマリ」に対応する表示専用コンポーネント。
 */
export function PeriodSummaryCard({ title, metrics }: PeriodSummaryCardProps) {
  return (
    <Card title={title}>
      <div className={styles.grid}>
        {metrics.map((metric) => (
          <MetricTile key={metric.label} {...metric} />
        ))}
      </div>
    </Card>
  );
}
