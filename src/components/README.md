# src/components

共有UIコンポーネント（Client Components中心）。詳細は
`docs/design/frontend-design.md` §3-4 を参照。

- `charts/` — `"use client"` のRechartsラッパー群
  （TimeSeriesChart / StackedBarChart / MemoryChart / LoadChart / ContainerChart / DbSizeChart）。
  データはServer側（`src/lib/aggregation`）で確定済みのものをpropsで受け取り、描画に専念する。
- `ui/` — バッジ・カード・テーブル等の汎用UIプリミティブ
  （StatusBadge / TrendIndicator / MetricCard / Sparkline / DataTable / StaleNotice /
  ApproxNotice / EmptyState）。
- `layout/` — ナビ・ヘッダー・ページ枠などの共通レイアウト部品。

本実装は後続タスクで追加する。このディレクトリ構成は雛形（tz8）として作成したもの。
