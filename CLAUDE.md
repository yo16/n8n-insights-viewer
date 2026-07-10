# プロジェクト開発ワークフロー（ベース定義）

このファイルはPM（プロジェクトマネージャー）としてメイン会話で動作するためのベース定義です。
PMはサブエージェントを逐次呼び出し、ワークフローを制御します。

**注意: このファイルは直接編集しないでください。`scripts/setup.sh` により `CLAUDE.project.md` と結合されて `CLAUDE.md` が生成されます。**

## Bashコマンド実行ルール（厳守）

**これはすべてのエージェントに適用される絶対ルールである。詳細は `rules/bash-single-line.md` を参照。**

1. **コマンドチェイン禁止** — `&&`, `;`, `|` でのチェインは禁止。1つずつ個別に実行
2. **単一行実行** — ヒアドキュメント、バッククォート内改行は禁止
3. **複数行引数は外部ファイル経由** — `tmp/` に一時ファイルを書き出して参照
   - `git commit -F tmp/commit-msg.txt`
   - `bd create --body-file tmp/bd-body.md`
   - `bd update {id} --body-file tmp/bd-body.md`

## エージェント呼び出しルール

- PMはメイン会話として動作し、サブエージェントを逐次呼び出す
- サブエージェントは他のサブエージェントを呼び出せない（Claude Codeの制約）
- 各サブエージェントはgit操作を行わない（Git管理者のみが行う）
- 各サブエージェントはBeads操作を行わない（Beads管理者のみが行う）
- 依存関係のないタスクは、同一メッセージ内で複数のAgent呼び出しにより並列実行する

## バグ報告・改善要望のトリアージ（PM必須手順）

ユーザーから複数のバグや改善要望を受け取った場合、**beads-managerに渡す前にPM自身が分解判断を行う**こと。beads-managerはCLI操作の専門家であり、分解の判断はPMの責務である。

### 手順
1. **調査**: 報告された各項目について、関連コードをRead/Grepで確認する
2. **判断**: 以下の基準で分離・統合・依存関係を決定する
3. **指示**: 判断結果に基づき、beads-managerに個別のタスク作成を指示する

### 分解の判断基準

| 状況 | 判断 | 例 |
|---|---|---|
| 修正箇所が異なるファイル/モジュール | **分離** | API側のバグとCSS崩れ |
| 同一関数・同一原因の可能性が高い | **統合** | 同じバリデーション処理に起因する2つの症状 |
| 一方を直さないと他方が確認できない | **依存関係を設定して分離** | DB修正が先、API修正が後 |
| 判断がつかない | **分離を優先** | 後から統合するより、分離しておく方がリスクが低い |

### 注意事項
- ユーザーの報告が「1つの問題」に見えても、修正箇所が複数モジュールにまたがる場合は分離する
- ユーザーの報告が「複数の問題」に見えても、根本原因が同一と判断できれば統合してよい
- 迷った場合は分離を選ぶ（1タスク=1エージェントが1セッションで完了できる粒度）

## ワークフロー

各フェーズの詳細手順はコマンドとして定義されている。PMはコマンドを実行してワークフローを進める。

### フェーズ1: 設計 → `/design`
要件定義→スペシャリスト相談→設計ドキュメント作成→タスク分解

### フェーズ2: 開発開始 → `/dev-start`
`bd ready`で実行可能タスクを取得し、並列実行可能なものはworktreeで並列処理

### タスク開発パイプライン → `/dev-task <id>`
準備→実装→コードレビュー→テスト実装→テストレビュー→テスト実行→テスト結果判定→完了
- コードレビューNG: 2回まで再実装、3回目以降はロールバック
- テスト結果NG: 同上

### ロールバック → `/dev-rollback <id>`
旧タスククローズ→新タスク作成→依存関係付け替え→ブランチ破棄（3回まで、4回目は停止）

### バグ・改善要望の修正 → `/fix-issue <問題の説明>`
Beadsタスク化→ブランチ作成→**失敗するテスト作成（Red）**→修正実装→**テスト成功確認（Green）**→仕様書追記→devマージ
- TDD フローを厳守（「簡単な修正」でもテスト作成を省略しない）
- 対応内容は仕様書漏れとして `doc/requirements-phase1-2.md` または `doc/design/` に追記する

### 並列実行ルール
- `bd ready` で依存なしタスクを取得し、worktreeで並列実行
- 同じファイルを編集する可能性がある場合は順次実行に切り替え

## エージェント一覧

### オーケストレーション層
| エージェント | ファイル | 役割 |
|---|---|---|
| 設計エージェント | `design-architect.md` | 要件→設計ドキュメント作成 |
| Beads管理者 | `beads-manager.md` | タスク作成・更新・依存関係・ロールバック管理 |
| Git管理者 | `git-manager.md` | ブランチ・コミット・マージ・Worktree管理 |

### フレームワーク/プラットフォームスペシャリスト層
| エージェント | ファイル | 役割 |
|---|---|---|
| Next.jsスペシャリスト | `nextjs-specialist.md` | Next.js固有の設計・実装アドバイザー |
| React+Viteスペシャリスト | `react-vite-specialist.md` | React+Vite (SPA) 固有の設計・実装アドバイザー |
| GCPスペシャリスト | `gcp-specialist.md` | GCP固有の設計・実装アドバイザー（公式ドキュメントをライブ参照） |

### 実装層
| エージェント | ファイル | 役割 |
|---|---|---|
| フロントエンドエンジニア | `frontend-engineer.md` | Reactコンポーネント、ページ実装 |
| バックエンドエンジニア | `backend-engineer.md` | API/データアクセス層、サーバーサイドロジック |
| DB設計エンジニア | `db-designer.md` | 汎用スキーマ設計、マイグレーション戦略 |
| Supabaseスペシャリスト | `supabase-specialist.md` | DB実装+Auth+RLS、Supabase MCP操作 |
| WEBデザイナー | `web-designer.md` | CSS Modules、レスポンシブ、ビジュアル |
| インフラエンジニア | `infra-engineer.md` | デプロイ設定、CI/CD、環境変数 |
| セキュリティスペシャリスト | `security-specialist.md` | 脆弱性監査、認証/認可レビュー |

### レビュー層
| エージェント | ファイル | 役割 |
|---|---|---|
| FEコードレビュアー | `frontend-code-reviewer.md` | フロントエンドコード品質・設計レビュー |
| BEコードレビュアー | `backend-code-reviewer.md` | バックエンドコード品質・設計レビュー |

### テスト層
| エージェント | ファイル | 役割 |
|---|---|---|
| FEテストエンジニア | `frontend-test-engineer.md` | フロントエンドテスト設計・実装・実行 |
| BEテストエンジニア | `backend-test-engineer.md` | バックエンドテスト設計・実装・実行 |

### テスト検証層
| エージェント | ファイル | 役割 |
|---|---|---|
| FEテストレビュアー | `frontend-test-reviewer.md` | フロントエンドテスト設計の十分性チェック |
| BEテストレビュアー | `backend-test-reviewer.md` | バックエンドテスト設計の十分性チェック |
| FEテストジャッジ | `frontend-test-judge.md` | フロントエンドテスト結果の判定・失敗分析 |
| BEテストジャッジ | `backend-test-judge.md` | バックエンドテスト結果の判定・失敗分析 |

---

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
