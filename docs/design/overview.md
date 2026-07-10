# 設計概要 — n8n-insights-viewer

セルフホストn8n（GCE上）の **Insights** と **マシン負荷** を可視化する、
ローカル実行のNext.js BIアプリの設計ドキュメント群。本ページは全設計への入口。

- 要件定義: [docs/requirements.md](../requirements.md)（決定事項は §8、未決事項なし）
- 作成日: 2026-07-10

---

## 1. 設計ドキュメント一覧

| ドキュメント | 内容 |
|---|---|
| [app-architecture.md](./app-architecture.md) | アプリ構成・ページ構成・状態管理・ディレクトリ構造・RSC境界 |
| [data-sync-design.md](./data-sync-design.md) | 同期CLI（6フェーズ）・負荷収集スクリプト（方式D）・deploy-collector |
| [db-design.md](./db-design.md) | 閲覧用SQLiteのスキーマ・n8n DBからの抽出マッピング・更新戦略 |
| [api-design.md](./api-design.md) | データアクセス層（Server Components / Route Handler / better-sqlite3）・集計・状態評価 |
| [frontend-design.md](./frontend-design.md) | コンポーネント設計・6画面・チャート構成・ページ遷移 |
| [styling-design.md](./styling-design.md) | デザインシステム・カラー・タイポグラフィ（CSS Modules） |
| [security-design.md](./security-design.md) | 機微データ除去・生コピー削除・本番サーバー保護・.gitignore方針 |

---

## 2. 要件の要約

- **目的**（[要件 §1](../requirements.md)）: ①ワークフローごとの実行数・成功/失敗・実行時間の推移、
  ②GCEインスタンスのマシン負荷（CPU/メモリ/swap）の推移を可視化。
  背景に2026-07のOOMキラー障害があり、**再発の予兆検知**が主眼
- **データ取得**（[要件 §4](../requirements.md)）: 本番DB（SQLite）を**ファイルコピーで取得**し、
  ローカルで必要5テーブルのみ抽出。本番への変更ゼロ。生コピーは抽出後に削除
- **マシン負荷収集**（[要件 §5](../requirements.md)）: VM上のcronで1時間ごとにファイル出力（方式D・主）+
  同期時スポット収集（方式B）+ GCP Monitoring APIでCPU補完（方式C）
- **アプリ**（[要件 §6](../requirements.md)）: Next.js（App Router）+ TypeScript + better-sqlite3 + Recharts。
  6画面。JST変換表示。状態バッジ/閾値線/OOMマーカー/トレンドで予兆を可視化。外部通知なし
- **実行形態**: この端末（Windows 11）でローカル実行のみ。デプロイしない

### 2.1 重要な制約（厳守）

- **本番サーバー保護**: ソフト導入・常駐追加・n8nワークフロー追加をしない。
  例外は承認済みの収集スクリプト1本+cron1行のみ（[security-design.md §5](./security-design.md#5-本番サーバー保護)）
- **機微データ**: 生コピー（credentials等を含む）は抽出後に必ず削除。`data/` はコミット禁止
  （[security-design.md](./security-design.md)）
- **JST変換・欠測明示・今日までの時間軸**: 表示・集計はJST。欠測は補間せず明示。
  時間軸は今日まで（データ末尾以降は空白で古さを可視化）（[要件 §6.2](../requirements.md)）

---

## 3. 全体アーキテクチャ

```
[本番n8n(GCE, SQLite)]
      │ ① gcloud ssh(cp) + scp（読み取りのみ）
      ▼
[data/raw/ 生コピー]──② 抽出(必要5表)──▶[data/n8n_insights.sqlite(WAL)]◀── 収集: 方式B/C/D
      │  ③ 生コピー削除（必ず）                       ▲ 蓄積(read-write: 同期CLIの専権)
      ▼                                              │
   （同期CLI: fetch→validate→extract→ingest→collect-metrics→cleanup, tsx）
                                                     │ read-only
                                                     ▼
                              [Next.js App Router（この端末で npm run dev）]
                                ├ Server: lib/db/queries + lib/aggregation（JST/集計/状態評価）
                                ├ Client: components/charts（Recharts）・同期ボタン・フィルタ
                                └ Route Handler: POST /api/sync（spawn, 409）/ GET /api/sync/stream（SSE）
```

### 3.1 アーキテクチャ方針（骨子）

- **RSC-first**: 取得・集計・JST変換・状態評価はすべてServer側。Clientはチャート・ボタン・フィルタUIのみ。
  フィルタはURL searchParams経由でサーバー再クエリ（[app-architecture.md §4](./app-architecture.md#4-rsc境界とデータフロー)）
- **プロセス分離**: 同期はBIと別プロセスの手動CLI。BIからはRoute Handlerで子プロセス起動
  （[data-sync-design.md](./data-sync-design.md)）
- **純粋層の共有**: JST変換・状態評価・スキーマ定義・collectorパースは `src/shared`（Next.js非依存）に置き、
  CLIとアプリで判定ロジックを共有（[app-architecture.md §3.3](./app-architecture.md#33-srcshared--nextjs非依存の純粋層)）
- **better-sqlite3 read-only**: `import "server-only"` + `{readonly, fileMustExist}` + `query_only=ON`、
  WALモード、globalThisシングルトン、`serverExternalPackages`指定、全ページ`force-dynamic`
  （[api-design.md §2](./api-design.md#2-接続管理better-sqlite3-read-only)）

---

## 4. データフローの要点

| 局面 | 要点 | 参照 |
|---|---|---|
| 同期 | 6フェーズ。cleanupは失敗時も必ず生コピー削除 | [data-sync](./data-sync-design.md#2-同期cliの全体フロー) |
| スキーマ検証 | n8n `latest` タグ運用のため毎回検証。差異で中断 | [data-sync §4.2](./data-sync-design.md#42-phase-2-validate) |
| 取り込み戦略 | insights系=全置換 / execution_entity=UPSERT追記蓄積 | [db-design §4](./db-design.md#4-取り込みマッピング更新戦略) |
| 粒度混在 | hour/day/week混在をday正規化。集計層に閉じ込め | [api-design §4](./api-design.md#4-集計層aggregation) |
| 状態評価 | 最新値を閾値と比較→正常/注意/危険+根拠。config毎回読み | [api-design §4.3](./api-design.md#43-状態評価ロジック) |
| 欠測/今日まで | 欠測は補間せずギャップ、右端は今日固定 | [frontend §4.1](./frontend-design.md#41-チャート共通仕様) |

---

## 5. 主要な設計判断（一覧）

- **WALモードで蓄積DB作成**: 同期の書き込みとBIの読み取りの同時発生に対応
- **execution_entityのみUPSERT追記**: 7日pruneに対抗し明細を永続化。他は本番ミラーとして全置換
- **CPU/docker statsを別テーブル化**: 出所・粒度が異なるため分離（[db-design §8](./db-design.md#8-設計判断)）
- **同期はRoute Handler + SSE、読み取りは直接クエリ**: REST APIは作らない（YAGNI）
- **JST=UTC+9固定の自前純粋関数**: date-fns-tz不要、getUTC系のみ使用
- **CSS Modules + CSS変数トークン**: Tailwind禁止制約下で状態色の一貫性を担保
- **deploy-collectorは承認フロー必須**: 本番への設置は内容表示→ユーザー確認→冪等実行

各判断の理由は各ドキュメント末尾の「設計判断」節を参照。

---

## 6. 実装時の入口（ワークフロー分割の起点）

1. **DB基盤**: [db-design.md](./db-design.md) のDDL → `src/lib/db/`・`src/shared/n8n-schema`
2. **同期CLI**: [data-sync-design.md](./data-sync-design.md) → `scripts/sync/`・`src/shared/`
3. **収集/設置**: [data-sync-design.md §3-4](./data-sync-design.md#3-収集スクリプト方式d--collectorsh) → `scripts/deploy-collector/`
4. **データアクセス/集計**: [api-design.md](./api-design.md) → `src/lib/db/queries`・`src/lib/aggregation`
5. **画面**: [frontend-design.md](./frontend-design.md) + [styling-design.md](./styling-design.md) → `src/app/`・`src/components/`
6. **横断**: [security-design.md](./security-design.md) は全工程で遵守
