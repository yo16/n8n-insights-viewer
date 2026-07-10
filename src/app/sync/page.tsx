import { DbNotFoundError, getDb } from "@/lib/db/connection";
import { getLatestSyncHistory, getSyncHistoryList } from "@/lib/db/queries/sync";
import { formatJstDateTime } from "@/shared/datetime";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SyncButton } from "@/components/sync/SyncButton";
import { SyncHistoryTable } from "@/components/sync/SyncHistoryTable";
import { formatSyncStatusLabel } from "@/components/sync/syncStatusLabel";
import { getCoverageRange } from "./_lib/coverage";
import { evaluateStaleness, STALE_WARNING_DAYS } from "./_lib/staleness";
import styles from "./page.module.css";

/**
 * 画面6: 同期ステータス（`docs/design/frontend-design.md` 画面6 が唯一の正）。
 *
 * 表示項目:
 * - 最終同期日時（JST）・データのカバー範囲・直近の同期履歴一覧
 * - 未同期警告（最終成功同期から6日超。`docs/requirements.md` §4.3）
 * - 同期実行ボタン（`SyncButton`, Client Component）
 *
 * DB未作成（初回同期前）は `DbNotFoundError` を捕捉し、`EmptyState` で案内する
 * （`docs/design/api-design.md` §2.5 / §7）。同期ボタンはこの状態でも表示する
 * （初回同期の起動手段として使えるようにするため）。
 */
export const dynamic = "force-dynamic";

/** 履歴一覧に表示する件数（画面表示用）。 */
const HISTORY_DISPLAY_LIMIT = 20;
/** 未同期警告の判定に遡って走査する件数（表示件数より広めに取り、直近の成功実績を
 *  見逃さないようにする）。 */
const HISTORY_SCAN_LIMIT = 100;

function formatDays(days: number): string {
  if (days < 1) return "1日未満";
  return `約${Math.floor(days)}日`;
}

export default function SyncStatusPage() {
  let db;
  try {
    db = getDb();
  } catch (err) {
    if (err instanceof DbNotFoundError) {
      return (
        <div className={styles.page}>
          <h1 className={styles.heading}>同期ステータス</h1>
          <EmptyState
            title="まだ同期されていません"
            message="蓄積DBが見つかりません。npm run sync を実行するか、下のボタンから同期を実行してください。"
          >
            <SyncButton />
          </EmptyState>
        </div>
      );
    }
    throw err;
  }

  const latest = getLatestSyncHistory(db);
  const historyForScan = getSyncHistoryList(db, HISTORY_SCAN_LIMIT);
  const history = historyForScan.slice(0, HISTORY_DISPLAY_LIMIT);
  const coverage = getCoverageRange(db);
  const staleness = evaluateStaleness(historyForScan);

  return (
    <div className={styles.page}>
      <h1 className={styles.heading}>同期ステータス</h1>

      <Card title="最終同期">
        {latest ? (
          <dl className={styles.summaryList}>
            <div className={styles.summaryItem}>
              <dt>実行日時（JST）</dt>
              <dd>{formatJstDateTime(latest.started_at)}</dd>
            </div>
            <div className={styles.summaryItem}>
              <dt>状態</dt>
              <dd>{formatSyncStatusLabel(latest.status)}</dd>
            </div>
            <div className={styles.summaryItem}>
              <dt>到達フェーズ</dt>
              <dd>{latest.phase_reached ?? "—"}</dd>
            </div>
            {latest.error_message ? (
              <div className={styles.summaryItem}>
                <dt>エラー</dt>
                <dd className={styles.errorText}>{latest.error_message}</dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p>同期の実行履歴がありません。まだ一度も同期が実行されていません。</p>
        )}
      </Card>

      {staleness.isStale ? (
        <div className={styles.staleWarning} role="alert">
          <p className={styles.staleWarningTitle}>
            ⚠ 未同期警告
          </p>
          <p>
            {staleness.lastSuccess?.finished_at ? (
              <>
                最終成功同期（{formatJstDateTime(staleness.lastSuccess.finished_at)}
                ・JST）から
                {staleness.daysSinceLastSuccess !== null
                  ? formatDays(staleness.daysSinceLastSuccess)
                  : ""}
                が経過しています。サーバー側の実行明細は7日で消えるため、
                {STALE_WARNING_DAYS}日を超えるとそろそろ同期しないと実行明細に穴が
                開きます。早めの同期をおすすめします。
              </>
            ) : (
              <>
                同期に一度も成功していません。サーバー側の実行明細は7日でpruneされる
                ため、早めに同期を実行してください。
              </>
            )}
          </p>
        </div>
      ) : null}

      <Card title="データのカバー範囲">
        <table className={styles.coverageTable}>
          <thead>
            <tr>
              <th scope="col">データ種別</th>
              <th scope="col">開始（JST）</th>
              <th scope="col">終了（JST）</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Insights（実行数・成功/失敗・実行時間）</th>
              <td className={styles.numeric}>
                {coverage.insights.min
                  ? formatJstDateTime(coverage.insights.min)
                  : "—"}
              </td>
              <td className={styles.numeric}>
                {coverage.insights.max
                  ? formatJstDateTime(coverage.insights.max)
                  : "—"}
              </td>
            </tr>
            <tr>
              <th scope="row">実行明細（ローカル蓄積分）</th>
              <td className={styles.numeric}>
                {coverage.executions.min
                  ? formatJstDateTime(coverage.executions.min)
                  : "—"}
              </td>
              <td className={styles.numeric}>
                {coverage.executions.max
                  ? formatJstDateTime(coverage.executions.max)
                  : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </Card>

      <Card title="同期の実行">
        <SyncButton />
      </Card>

      <Card title="同期履歴">
        {history.length > 0 ? (
          <SyncHistoryTable rows={history} />
        ) : (
          <p>同期の実行履歴がありません。</p>
        )}
      </Card>
    </div>
  );
}
