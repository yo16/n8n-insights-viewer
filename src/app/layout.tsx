import type { Metadata } from "next";
import { AppShell } from "@/components/layout/AppShell";
import "./globals.css";

export const metadata: Metadata = {
  title: "n8n Insights Viewer",
  description: "セルフホストn8nのInsightsとマシン負荷を可視化するローカルBIアプリ",
};

/**
 * ルートレイアウト。
 *
 * 全画面共通のシェル（サイドナビ）を `AppShell` で提供する
 * （docs/design/frontend-design.md §2 共通レイアウト）。
 * ヘッダの状態バッジ・最終同期表示は、データアクセス層が実装される
 * 後続タスクで追加する。
 */
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
