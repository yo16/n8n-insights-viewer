# プロジェクト固有設定

## プロジェクト概要

n8n-insights-viewer — セルフホストn8n（GCE上）のInsightsとマシン負荷を可視化するローカルBIアプリ。
要件定義: `docs/requirements.md`（**実装前に必読。特に§4/§5/§7の本番サーバー保護の制約**）

## 技術スタック

- フレームワーク: Next.js (App Router) + TypeScript
- DB: **better-sqlite3**（ローカルの閲覧用SQLite。Supabaseは使わない）
  - データは本番n8nサーバーのDBコピーから同期コマンドで取り込む（`docs/requirements.md` §4）
- グラフ: Recharts
- デプロイ: **なし**（この端末=Windows 11上で `npm run dev` / `npm run start` のみ）
- タスク管理: Beads
- テスト: Jest（+ Playwright: E2E）
- スタイリング: CSS Modules（Tailwind CSS は禁止）

### クラウド
- GCP（GCE）は**データ取得元**（デプロイ先ではない）。gcloud CLI（ssh/scp）と
  Cloud Monitoring APIを同期・収集スクリプトから使用する
- GCP固有の判断が必要な場合は `gcp-specialist` に相談する

## 外部連携が必要なエージェントのセットアップ

| エージェント | 必要な設定 | 詳細 |
|---|---|---|
| `gcp-specialist` | `GOOGLE_DEV_KNOWLEDGE_API_KEY`（任意） | `agents/gcp-specialist.md`（最新化体制は `references/gcp-maintenance.md`） |

## Git戦略

### ブランチ構成
- `main`: 正式版ブランチ（エージェント操作禁止）
- `dev`: 開発ブランチ（featureブランチのマージ先）
- `feature/bd-{beads-id}`: タスクごとのブランチ

### ルール
- Git Worktreeを使い、並行で進められるタスクは並行で進める
- featureブランチはBeadsのIDを使って命名する
- mainブランチはエージェントが操作しない（devへのマージのみエージェントが行い、dev→mainへのマージはユーザーが手動で行う）

## 要件定義ドキュメント

- 配置先: `docs/requirements.md`
- **注意**: ベース定義やコマンド内の `doc/` 表記は、本プロジェクトでは `docs/` と読み替える
  （`/fix-issue` の仕様書追記先も `docs/requirements.md` または `docs/design/`）

## 設計ドキュメント構成

- `docs/design/overview.md`: 設計概要（各ドキュメントへのリンク集）
- `docs/design/app-architecture.md`: アプリ構成、ページ構成、状態管理
- `docs/design/data-sync-design.md`: 同期コマンド・負荷収集スクリプト・VM設置（deploy-collector）の設計
- `docs/design/db-design.md`: ローカル蓄積DB（閲覧用SQLite）のスキーマ設計、n8n DBからの抽出マッピング
- `docs/design/api-design.md`: データアクセス層設計（Server Components / Route Handlers、better-sqlite3のread-onlyアクセス）
- `docs/design/frontend-design.md`: コンポーネント設計、ページ遷移、チャート構成
- `docs/design/styling-design.md`: デザインシステム、カラー、タイポグラフィ
- `docs/design/security-design.md`: 機微データ（credentials等）の除去・生コピー削除、`.gitignore` 方針

## プロジェクト固有ルール

### 本番サーバー保護（最重要・厳守）
- 本番n8nサーバー（GCE）への**ソフトウェア導入・常駐プロセス追加・n8nへのワークフロー追加は禁止**
- サーバー上での操作は標準コマンドによる読み取り（cat/cp/ls等）とscpによるファイル取得のみ
- 唯一の例外は負荷収集スクリプト1本+cron1行の設置（`docs/requirements.md` §5.3）。
  設置・更新時は**内容を表示してユーザーの承認を得てから**実行する。黙って設置・変更しない
- `gcloud compute ssh/scp` を実行するコードを書く際も、書き込み系の操作を含めないこと

### データの取り扱い
- `data/` ディレクトリ（DBコピー・蓄積DB）は**コミット禁止**（`.gitignore` 済み）
- n8n DBの生コピーには credentials 等の機微テーブルが含まれる。
  必要5テーブルの抽出後、**生コピーを必ず削除**する処理にすること

### 表示・集計
- DB内の日時はUTC。**表示・集計はJST（Asia/Tokyo）に変換**する（`docs/requirements.md` §6.2）
- グラフの時間軸は「今日」まで表示し、データ末尾以降は欠測として明示する（補間・ゼロ埋め禁止）
