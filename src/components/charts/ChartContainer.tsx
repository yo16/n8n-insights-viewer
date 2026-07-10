"use client";

import type { ReactNode } from "react";
import type { ChartLegendItem } from "./types";
import styles from "./ChartContainer.module.css";

export interface ChartContainerProps {
  /** チャートタイトル（省略可） */
  title?: string;
  /** カスタム凡例（tokens.cssの色に対応する凡例チップ + ラベル） */
  legend?: ChartLegendItem[];
  /** チャート本体の高さ（px） */
  height?: number;
  /** チャート下部の注記（UTC近似注記・データ末尾注記等） */
  footnote?: ReactNode;
  children: ReactNode;
}

/**
 * チャートの入れ物（タイトル・凡例・高さ調整）。
 *
 * Rechartsの各チャートコンポーネント（TimeSeriesChart/CategoryBarChart）はこの中に
 * `ResponsiveContainer` を描画する。凡例はRecharts標準の`Legend`ではなく、
 * tokens.cssの色と確実に対応させるため独自実装する
 * （docs/design/styling-design.md §5）。
 */
export function ChartContainer({ title, legend, height = 280, footnote, children }: ChartContainerProps) {
  return (
    <div className={styles.container}>
      {title || (legend && legend.length > 0) ? (
        <div className={styles.header}>
          {title ? <h3 className={styles.title}>{title}</h3> : <span />}
          {legend && legend.length > 0 ? (
            <ul className={styles.legend}>
              {legend.map((item) => (
                <li key={item.label} className={styles.legendItem}>
                  <span
                    className={styles.legendSwatch}
                    style={{
                      background: item.color,
                      borderTop: item.strokeDasharray ? `2px dashed ${item.color}` : undefined,
                    }}
                    aria-hidden="true"
                  />
                  {item.label}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      <div className={styles.body} style={{ height }}>
        {children}
      </div>
      {footnote ? <div className={styles.footnote}>{footnote}</div> : null}
    </div>
  );
}
