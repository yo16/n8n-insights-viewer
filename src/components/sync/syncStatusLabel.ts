/**
 * `sync_history.status` / 同期ジョブの状態を日本語ラベルへ変換する。
 * Server Component（`SyncHistoryTable`）とClient Component（`SyncButton`）の
 * 双方から使う、Next.js非依存の純粋関数（`docs/design/frontend-design.md` 画面6）。
 */
const STATUS_LABEL: Record<string, string> = {
  running: "実行中",
  success: "成功",
  failed: "失敗",
  aborted: "中断",
};

export function formatSyncStatusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}
