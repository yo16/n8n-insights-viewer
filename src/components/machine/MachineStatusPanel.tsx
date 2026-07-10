import { StatusBadge } from "@/components/ui/StatusBadge";
import type { StatusResult, TrendResult } from "@/lib/aggregation";
import { TrendIndicator } from "./TrendIndicator";
import styles from "./MachineStatusPanel.module.css";

export interface MachineStatusPanelProps {
  status: StatusResult;
  memAvailableTrend: TrendResult;
  dbSizeTrend: TrendResult;
}

/**
 * 現在の状態バッジ + 判定根拠 + 主要指標のトレンド表示（要件 §6.3）。
 */
export function MachineStatusPanel({
  status,
  memAvailableTrend,
  dbSizeTrend,
}: MachineStatusPanelProps) {
  const reason = status.reasons.length > 0 ? status.reasons.join(" / ") : undefined;

  return (
    <section className={styles.panel} aria-label="現在の状態">
      <div className={styles.badgeRow}>
        <StatusBadge status={status.level} reason={reason} />
      </div>
      <div className={styles.trends}>
        <TrendIndicator
          label="MemAvailable"
          direction={memAvailableTrend.direction}
          isReference={memAvailableTrend.isReference}
          sampleCount={memAvailableTrend.sampleCount}
        />
        <TrendIndicator
          label="DBサイズ"
          direction={dbSizeTrend.direction}
          isReference={dbSizeTrend.isReference}
          sampleCount={dbSizeTrend.sampleCount}
        />
      </div>
    </section>
  );
}
