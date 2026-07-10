import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "n8n Insights Viewer",
  description: "セルフホストn8nのInsightsとマシン負荷を可視化するローカルBIアプリ",
};

/**
 * ルートレイアウト。
 *
 * この雛形の時点ではナビゲーション等は未実装（後続タスクで
 * docs/design/frontend-design.md §2 の共通レイアウト（サイドナビ・状態バー）を追加する）。
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
