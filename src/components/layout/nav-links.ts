/**
 * 全画面共通ナビゲーションのリンク定義。
 *
 * docs/design/frontend-design.md §2 共通レイアウト / §6 ページ遷移図。
 * 5画面（insights/workflows/executions/machine/sync）は後続タスクで実装されるため
 * 現時点ではリンク先ページが存在せず404になるが、ナビはこのタスクで用意する。
 */
export type NavLink = {
  href: string;
  label: string;
};

export const NAV_LINKS: readonly NavLink[] = [
  { href: "/", label: "ダッシュボード" },
  { href: "/insights", label: "Insights推移" },
  { href: "/workflows", label: "ワークフロー" },
  { href: "/executions", label: "実行明細" },
  { href: "/machine", label: "マシン負荷" },
  { href: "/sync", label: "同期" },
];
