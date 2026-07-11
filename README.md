# n8n-insights-viewer

セルフホストn8n（GCE上）の **Insights（ワークフロー実行実績）** と **マシン負荷状況** を可視化する、ローカル専用のBIアプリです。

n8nをアップグレードしなくても、n8nのDBに蓄積されているInsightsの元データ（`insights_by_period` 等）を活用します。本番サーバーのDBコピーをこの端末に取り込み、Next.js アプリで閲覧します。

## 特徴・設計原則

- **本番サーバーを変更しない**: サーバー上の操作は標準コマンドによる読み取りとscpによるファイル取得のみ。唯一の例外は、ユーザー承認のうえ設置する負荷収集スクリプト1本+cron1行（`docs/requirements.md` §5.3）
- **n8nに一切関与しない**: n8nへのワークフロー追加はしない（収集行為が実行記録・Insightsを汚染するため）
- **機微データを持ち込まない**: DB生コピーから必要5テーブルのみをホワイトリスト抽出し、credentials等を含む生コピーは即座に削除
- **ローカル完結**: この端末（Windows）上でのみ動作。デプロイなし。データはBIとは別プロセスの手動同期コマンドで取得
- **表示はJST**: DB内はUTC、表示・集計は日本時間。グラフは「今日」まで表示し、データ末尾以降は欠測として明示（ゼロ埋め・補間なし）

## システム構成

```
[本番GCE] n8n DB(SQLite) ──(sync: gcloud ssh/scp)──> data/raw/(生コピー・使用後削除)
[VM cron] collector.sh(毎時17分) ──(sync時に回収)──┐      │ 5テーブル抽出+検証
[GCP Monitoring] CPU使用率 ──(sync時にAPI取得)──────┴──> data/n8n_insights.sqlite(蓄積DB)
                                                            │ read-only
                                                   [Next.js BI] http://localhost:3000
```

- **蓄積DB**: 実行明細は同期のたびにUPSERT追記（本番側は7日で削除されるため手元に永続化）。Insights集計・マシンメトリクス・OOMイベント・同期履歴を保持
- **マシン負荷**: ①VM上のcollector.sh（毎時、方式D）②同期時のスポット収集（方式B）③GCP MonitoringのCPU（方式C、過去6週間まで遡及可）の3系統

## 前提条件

- Windows 11 + Node.js（npm）
- gcloud CLI がインストール・認証済みで、対象GCEインスタンスにSSHできること
- 接続先等は `scripts/sync/config.ts` の既定値（環境変数で上書き可能）

## セットアップ

```powershell
npm install
```

初回のみ、負荷収集スクリプトをVMへ設置します（**設置内容が表示され、yes入力で承認するまで何も変更されません**）:

```powershell
npm run deploy-collector          # 承認フロー付き設置
npm run deploy-collector -- --dry-run   # 表示のみ（設置しない）
```

再実行は冪等です（crontab行は置換され、二重登録されません）。アンインストール手順は設置完了時に表示されます。

## 使い方

### 1. データ同期（BIとは別プロセス・手動実行）

```powershell
npm run sync
```

fetch（DBコピー取得）→ validate（整合性・スキーマ検証）→ extract（5テーブル抽出）→ ingest（蓄積DBへ取り込み）→ collect-metrics（負荷データ回収）→ cleanup（生コピー削除）の順に実行されます。進捗はJSON Linesで出力されます。

- 定期実行は不要な設計です。**BIを見てデータが古ければ同期する**運用（画面の同期ボタンからも実行可能）
- ただし本番側の実行明細は7日で消えるため、**7日以上間隔を空けると明細履歴に穴が開きます**（6日超でBI画面に警告が出ます）

### 2. BIの起動

```powershell
npm run dev      # 開発モード
# または
npm run build
npm run start    # 本番モード
```

http://localhost:3000 を開きます。

| 画面 | 内容 |
|---|---|
| ダッシュボード（/） | 7日/30日サマリ（前期間比）、現在の状態バッジ（正常/注意/危険+判定根拠）、トレンド、負荷スパークライン |
| Insights推移（/insights） | 実行数（成功/失敗）・実行時間の時系列。期間・ワークフロー絞り込み |
| ワークフロー別（/workflows） | 実行数・成功率・実行時間・生涯累計の一覧。ソート・アクティブ絞り込み |
| 実行明細（/executions) | 蓄積した実行履歴。状態・期間等でフィルタ、error/crashed行を強調 |
| マシン負荷（/machine） | メモリ・スワップ・load・CPU・DBサイズの推移。**警告/危険の閾値線とOOM発生マーカー**付き |
| 同期ステータス（/sync） | 最終同期・データカバー範囲・履歴・未同期警告・同期実行ボタン |

### 3. 閾値の調整

状態バッジ・閾値線の基準は `config/thresholds.json` で変更できます（既定値は2026-07のOOM障害実測に基づく: MemAvailable 注意150MB/危険100MB等）。再起動不要、リロードで反映されます。

## データの取り扱い（重要）

- `data/` ディレクトリ（DBコピー・蓄積DB）は **コミット禁止**（`.gitignore` 済み）
- n8n DBの生コピーには credentials 等の機微テーブルが含まれるため、抽出後に必ず削除されます（失敗時も削除・削除結果は同期履歴の監査フラグに記録）

## 開発

```powershell
npm test          # Jest（単体・結合）
npm run lint
npx tsc --noEmit
```

- 要件定義: `docs/requirements.md`（本番サーバー保護の制約は §4/§5/§7）
- 設計ドキュメント: `docs/design/`（`overview.md` から辿れます）
- タスク管理: Beads（`bd ready` 等）
- テストは実gcloudを一切実行しません（コマンド実行層をフェイクに差し替え）

## ライセンス

[LICENSE](./LICENSE) を参照してください。
