import { formatJstDateTime } from "@/shared/datetime";
import type { SyncHistoryRow } from "@/lib/db/queries/sync";
import { formatSyncStatusLabel } from "./syncStatusLabel";
import styles from "./SyncHistoryTable.module.css";

export type SyncHistoryTableProps = {
  /** `getSyncHistoryList` 等で取得した履歴一覧（新しい順）。 */
  rows: SyncHistoryRow[];
};

const STATUS_CLASS: Record<string, string> = {
  success: "statusSuccess",
  failed: "statusFailed",
  running: "statusRunning",
  aborted: "statusAborted",
};

function formatRowsIngested(json: string | null): string {
  if (!json) return "—";
  try {
    const parsed = JSON.parse(json) as Record<string, number>;
    const entries = Object.entries(parsed);
    if (entries.length === 0) return "—";
    return entries
      .map(([table, count]) => `${table}: ${count.toLocaleString("ja-JP")}`)
      .join(" / ");
  } catch {
    return "—";
  }
}

function formatRawCopyDeleted(value: number | null): string {
  if (value === null) return "—";
  return value ? "削除済" : "未削除";
}

/**
 * 同期実行履歴のテーブル（画面6）。
 *
 * `docs/design/frontend-design.md` 画面6: status/phase_reached/取り込み件数/
 * raw_copy_deleted/エラーを一覧表示する。データ整形はすべてServer側（呼び出し元の
 * `page.tsx`）で確定済みの行を受け取るだけの表示専用コンポーネント（interactivityが
 * 無いため `"use client"` は付けない）。
 */
export function SyncHistoryTable({ rows }: SyncHistoryTableProps) {
  return (
    <div className={styles.wrapper}>
      <table className={styles.table}>
        <caption className={styles.visuallyHidden}>同期実行履歴一覧</caption>
        <thead>
          <tr>
            <th scope="col">開始（JST）</th>
            <th scope="col">状態</th>
            <th scope="col">到達フェーズ</th>
            <th scope="col">取り込み件数</th>
            <th scope="col">生コピー削除</th>
            <th scope="col">エラー</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className={styles.numeric}>
                {formatJstDateTime(row.started_at)}
              </td>
              <td className={styles[STATUS_CLASS[row.status] ?? ""] ?? undefined}>
                {formatSyncStatusLabel(row.status)}
              </td>
              <td>{row.phase_reached ?? "—"}</td>
              <td>{formatRowsIngested(row.rows_ingested_json)}</td>
              <td>{formatRawCopyDeleted(row.raw_copy_deleted)}</td>
              <td className={styles.errorCell}>{row.error_message ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
