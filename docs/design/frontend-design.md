# フロントエンド設計 — コンポーネント・ページ遷移・チャート構成（6画面）

## 関連ドキュメント

- [設計概要](./overview.md)
- [アプリ構成](./app-architecture.md) — RSC境界・ディレクトリ構造
- [データアクセス層設計](./api-design.md) — クエリ・集計・状態評価・同期起動
- [スタイリング設計](./styling-design.md) — デザインシステム・カラー
- [DB設計](./db-design.md)
- [要件 §6.1 画面・機能](../requirements.md) / [§6.2 表示上の注意](../requirements.md) / [§6.3 状態評価](../requirements.md)

---

## 1. 方針

- **6画面**（[要件 §6.1](../requirements.md)）。各ページはServer Component、
  チャートとインタラクションのみClient Component（[app-architecture.md §4](./app-architecture.md#4-rsc境界とデータフロー)）
- **チャートはRecharts**。`components/charts/` に `"use client"` のラッパーを置き、
  Server側で確定したデータをpropsで受けて描画するだけにする
- **時間軸は常に「今日」まで**、データ末尾以降は空白 + 注記、欠測は補間せず明示
  （[要件 §6.2 / §5.2](../requirements.md)）

---

## 2. 共通レイアウト

`app/layout.tsx` + `components/layout/`:

- **サイドナビ**（またはヘッダタブ）: 6画面へのリンク（ダッシュボード/Insights/ワークフロー/実行明細/マシン負荷/同期）
- **グローバル状態バー**: ヘッダに「最新の状態バッジ」（正常/注意/危険）と
  「最終同期: ○月○日 ○時（JST）」を常時表示。未同期6日超なら警告色（[要件 §4.3](../requirements.md)）
- 全ページ共通の「データはここまで」注記の描画ヘルパを持つ

---

## 3. 共通コンポーネント（components/ui）

| コンポーネント | 用途 |
|---|---|
| `StatusBadge` | 正常/注意/危険の3段バッジ。判定根拠をtooltip/併記（[要件 §6.3](../requirements.md)） |
| `TrendIndicator` | 増加/横ばい/減少の傾き表示（↑→↓）。「参考値」フラグ対応（[要件 §6.3](../requirements.md)） |
| `MetricCard` | サマリ数値カード（総実行数・成功率等） |
| `Sparkline` | 小型スパークライン（ダッシュボードの負荷ミニ表示） |
| `DataTable` | ソート可能テーブル（ワークフロー一覧・実行明細） |
| `StaleNotice` | 「データはここまで（最終同期: …）」注記 + 同期画面への誘導 |
| `ApproxNotice` | 「この期間はUTC区切りの近似値」注記（古い期間の日次集計。[要件 §6.2](../requirements.md)） |
| `EmptyState` | 空/未同期状態の案内 |

---

## 4. チャートコンポーネント（components/charts）

すべて `"use client"` の Recharts ラッパー。データ生成はServer側（[api-design.md §4](./api-design.md#4-集計層aggregation)）。

| コンポーネント | 種類 | 主な使用画面 |
|---|---|---|
| `TimeSeriesChart` | 折れ線/棒（実行数・成功/失敗・実行時間） | 画面1,2 |
| `StackedBarChart` | 積み上げ棒（成功/失敗の内訳） | 画面2 |
| `MemoryChart` | 折れ線 + **閾値参照線** + **OOMマーカー** + 欠測ギャップ | 画面1,5 |
| `LoadChart` | 折れ線（load average / CPU使用率） | 画面5 |
| `ContainerChart` | コンテナ別CPU/メモリ | 画面5 |
| `DbSizeChart` | DBサイズ推移 + 閾値線 | 画面5 |

### 4.1 チャート共通仕様

- **時間軸**: 右端を今日（JST）に固定。データ末尾以降は空白（[api-design.md §4.4](./api-design.md#44-時間軸と欠測)）
- **欠測**: `null` はギャップとして描く（`connectNulls={false}`）。ゼロ埋め・補間禁止
- **閾値参照線**: Rechartsの `ReferenceLine` で注意/危険ライン（[要件 §6.3](../requirements.md)）
- **OOMマーカー**: `ReferenceDot`/`ReferenceLine` でOOM発生時刻を描画（[要件 §6.3](../requirements.md)）
- ツールチップはJST時刻表示

---

## 5. 各画面の設計

### 画面1: ダッシュボード

- **表示項目**（[要件 §6.1](../requirements.md)）: 直近7日/30日のサマリ
  （総実行数・成功率・失敗数・総実行時間）、直近のマシン負荷スパークライン、**現在の状態バッジ**
- **コンポーネント**: `MetricCard`×4、`StatusBadge`（根拠併記）、`TrendIndicator`（MemAvailable/DBサイズ）、
  `Sparkline`（メモリ/swap）
- **データ**: `queries/dashboard.ts` + 状態評価（`shared/status`）
- **状態バッジ**: 最新収集値 → 正常/注意/危険（[api-design.md §4.3](./api-design.md#43-状態評価ロジック)）

### 画面2: Insights推移

- **表示項目**: 実行数・成功/失敗・実行時間の時系列（[要件 §6.1](../requirements.md)）
- **フィルタ**（URL searchParams・サーバー再クエリ）:
  粒度切替（hour/day/week）、期間指定、ワークフロー絞り込み
- **チャート**: `TimeSeriesChart`（実行数・実行時間）、`StackedBarChart`（成功/失敗内訳）
- **注記**: 粒度混在期間はdayに正規化、古い期間は `ApproxNotice`（UTC区切り近似。[要件 §6.2](../requirements.md)）
- **type=0（time_saved_min）**: 値ありのときのみ表示（現状は非表示。[要件 §6.2](../requirements.md)）

### 画面3: ワークフロー別一覧

- **表示項目**: ワークフローごとの実行数・成功率・平均/合計実行時間・累計値（workflow_statistics）
  （[要件 §6.1](../requirements.md)）
- **操作**: ソート（各列）、アクティブ絞り込み（active=1）。URL searchParams
- **コンポーネント**: `DataTable`。累計は生涯値（pruneの影響なし。[要件 §3.4](../requirements.md)）
- **データ**: `queries/workflows.ts`（workflow_entity + insights_by_period集計 + workflow_statistics結合）

### 画面4: 実行明細

- **表示項目**: ローカル蓄積した execution_entity（状態・モード・所要時間）（[要件 §6.1](../requirements.md)）
- **フィルタ**: 失敗のみ（status='error'）、モード別、期間。URL searchParams
- **コンポーネント**: `DataTable`（startedAt/status/mode/所要時間=stopped-started）
- **注記**: 7日を超える履歴はローカル蓄積分（[db-design.md execution_entity](./db-design.md#execution_entity追記upsertローカルに履歴蓄積)）。
  所要時間はstoppedAt-startedAtをJSTで表示

### 画面5: マシン負荷

- **表示項目**（[要件 §6.1](../requirements.md)）: メモリ（available/swap）・CPU load・
  コンテナ別使用量・DBサイズの時系列、OOMイベントのマーカー
- **チャート**: `MemoryChart`（閾値線 + OOMマーカー + 欠測ギャップ）、`LoadChart`（load/CPU）、
  `ContainerChart`、`DbSizeChart`（閾値線）
- **状態表現**:
  - 閾値参照線（注意/危険。[要件 §6.3](../requirements.md)）
  - OOM実績マーカー（「実際に落ちた水準」との比較）
  - 欠測区間の明示（方式D設置前・cron停止中。CPUは方式Cで補完済み区間を区別）
  - サンプルが少ないメモリ系は「参考値」明示（`TrendIndicator` の参考値フラグ）
- **データ**: `queries/machine.ts`（machine_metrics/container_stats/cpu_metrics/oom_events）

### 画面6: 同期ステータス

- **表示項目**（[要件 §6.1](../requirements.md)）: 最終同期日時、データのカバー範囲、取り込み件数、
  未同期期間の警告、同期スクリプト起動ボタン
- **未同期警告**: 最終成功から6日超で警告（[要件 §4.3](../requirements.md)、`shared/sync/staleness.ts`）
- **同期ボタン**（Client Component）:
  - クリック → `POST /api/sync`（実行中なら409 → 「実行中」表示）
  - `GET /api/sync/stream`（SSE）を購読し、フェーズ進捗バーを更新
    （[api-design.md §3](./api-design.md#3-同期の子プロセス起動)）
  - 完了/失敗を表示、`sync_history` から履歴一覧
- **collectorバージョン警告**: VM設置版とのズレを表示（[data-sync-design.md §3.4](./data-sync-design.md#34-バージョン不一致の扱い)）
- **コンポーネント**: `SyncButton`（use client, SSE購読）、`SyncHistoryTable`、`CoverageRange`

---

## 6. ページ遷移図

```
[ヘッダ状態バー: 状態バッジ + 最終同期]（全ページ共通）
        │
  ┌─────┼─────────────────────────────────────┐
  ▼     ▼         ▼          ▼         ▼        ▼
Dashboard Insights Workflows Executions Machine  Sync
 (/)     (/insights)(/workflows)(/executions)(/machine)(/sync)
  │                                                    ▲
  └── 状態バッジ/スパークライン → Machine へ誘導        │
      「データが古い」注記(StaleNotice) ────────────────┘（同期へ誘導）
```

- フィルタ変更は同一ページ内でsearchParams更新（画面遷移ではない）

---

## 7. 空状態・エラー状態

| 状態 | 表示 |
|---|---|
| 初回同期前（DB未作成） | `EmptyState`「まだ同期されていません。`npm run sync` を実行するか同期画面から実行してください」 |
| データはあるが該当なし（フィルタ結果0件） | 「条件に一致するデータがありません」 |
| データが古い（末尾<今日） | `StaleNotice` + 同期画面リンク |
| メトリクス欠測区間 | チャート上でギャップ表示（[要件 §5.2](../requirements.md)） |

---

## 8. 設計判断

- **チャートは薄いClientラッパー**: Rechartsはクライアント専用。ロジックはServerに寄せ、
  ラッパーは描画に徹する（RSC境界を明確化）
- **フィルタ=URL searchParams**: 状態の共有・リロード再現・サーバー再クエリを一貫させる（[要件 §6](../requirements.md)）
- **状態バッジをヘッダ常設**: 「画面を開けば予兆が一目でわかる」という要件§6.3の目的を、
  全画面共通のヘッダで満たす
- **欠測=ギャップ描画**: 補間・ゼロ埋め禁止（[要件 §5.2 / §6.2](../requirements.md)）を
  `connectNulls={false}` で実装
