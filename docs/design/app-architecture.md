# アプリ構成 — アーキテクチャ・ページ構成・状態管理・ディレクトリ構造

## 関連ドキュメント

- [設計概要](./overview.md)
- [データアクセス層設計](./api-design.md) — RSC境界・better-sqlite3・Route Handler
- [フロントエンド設計](./frontend-design.md) — コンポーネント・6画面
- [データ同期設計](./data-sync-design.md) — scripts/・src/shared/の共用
- [DB設計](./db-design.md)
- [要件 §6 アプリケーション要件](../requirements.md)

---

## 1. 全体アーキテクチャ方針

- **Next.js (App Router) + TypeScript**、**この端末（Windows 11）上でローカル実行**のみ。
  デプロイしない（[要件 §6.4](../requirements.md)）
- **データはローカルの閲覧用SQLiteをread-onlyで参照**（本番DBには接続しない）
- **サーバー中心（RSC-first）**: 取得・集計・JST変換・状態評価はすべてServer側。
  Client Componentsはチャート描画・ボタン・フィルタUIに限定
- **同期はBIと別プロセス**（手動CLI）。BIからはRoute Handlerで子プロセス起動できる
- **スタイリングはCSS Modules**（Tailwind禁止。[styling-design.md](./styling-design.md)）

---

## 2. ディレクトリ構造

ルートグループなしのフラット構成（[Next.jsスペシャリスト助言]）。

```
n8n-insights-viewer/
├── src/
│   ├── app/                          # App Router（全ページ force-dynamic）
│   │   ├── layout.tsx                # ルートレイアウト（ナビ・グローバルCSS）
│   │   ├── page.tsx                  # 画面1: ダッシュボード
│   │   ├── insights/page.tsx         # 画面2: Insights推移
│   │   ├── workflows/page.tsx        # 画面3: ワークフロー別一覧
│   │   ├── executions/page.tsx       # 画面4: 実行明細
│   │   ├── machine/page.tsx          # 画面5: マシン負荷
│   │   ├── sync/page.tsx             # 画面6: 同期ステータス
│   │   └── api/
│   │       └── sync/
│   │           ├── route.ts          # POST: 同期CLIをspawn起動（409で二重起動防止）
│   │           └── stream/route.ts   # GET: SSEで進捗配信
│   │
│   ├── components/
│   │   ├── charts/                   # "use client" Rechartsラッパー群
│   │   ├── ui/                        # バッジ・カード・テーブル等の汎用UI
│   │   └── layout/                    # ナビ・ヘッダー・ページ枠
│   │
│   ├── lib/                           # Server専用（import "server-only"）
│   │   ├── db/
│   │   │   ├── connection.ts          # better-sqlite3 read-onlyオープン + シングルトン
│   │   │   └── queries/               # 画面別クエリ関数
│   │   ├── aggregation/               # 集計・粒度正規化・状態評価・トレンド
│   │   ├── datetime/                  # （必要なら）server側の日時ヘルパ（純粋部分はshared）
│   │   ├── config/                    # thresholds.json 読み込み + zod検証
│   │   └── sync-process/              # Route Handlerから使う子プロセス管理
│   │
│   ├── shared/                        # ★Next.js非依存の純粋TS（CLIと共用・相対importで完結）
│   │   ├── datetime/                  # JST変換（UTC+9固定・getUTC系のみ）
│   │   ├── status/                    # 状態評価の純粋関数
│   │   ├── n8n-schema/                # 想定スキーマ定義（zod）
│   │   ├── collector/                 # collector出力のパース・バージョン定数
│   │   ├── sync/                      # 進捗イベントschema・未同期判定
│   │   └── types/                     # 共通型
│   │
│   └── styles/                        # グローバルCSS・CSS変数（デザイントークン）
│
├── scripts/
│   ├── sync/                          # 同期CLI（tsxで実行, npm run sync）
│   └── deploy-collector/              # collector.sh + 設置CLI（npm run deploy-collector）
│
├── config/
│   └── thresholds.json                # 閾値設定（zod検証・毎回読み込み）
│
├── data/                              # ★gitignore済み（DBコピー・蓄積DB。機微データ）
│   ├── raw/                           # 生コピー（抽出後に必ず削除）
│   └── n8n_insights.sqlite            # 閲覧用DB（WAL）
│
└── docs/
    ├── requirements.md
    └── design/                        # 本設計ドキュメント群
```

### 2.1 なぜフラット構成か

画面数6・単一ユーザー・認証なしのため、ルートグループで分ける利点がない。
URLとファイルの対応を素直に保ち、ナビゲーションを単純にする（[要件 §6.1](../requirements.md)の6画面）。

---

## 3. レイヤ責務

### 3.1 src/app — ページ（RSC）

各 `page.tsx` はServer Component。`searchParams` を受け取り、`lib/db/queries` +
`lib/aggregation` を呼んでデータを整え、Client Componentへ**確定済みデータ**を渡す。

### 3.2 src/lib — Server専用ロジック

- `import "server-only"` を徹底し、クライアントバンドルへ混入させない
- better-sqlite3・fs（config読み込み）・child_process（同期起動）はここに閉じる

### 3.3 src/shared — Next.js非依存の純粋層

- **同期CLI（tsx実行）とアプリの双方から相対importで使う**共通ロジック
- Next.js API・server-only・fs等に依存させない（純粋関数・型・zodスキーマのみ）
- JST変換・状態評価・スキーマ定義・collectorパースなど「両者が同じルールで扱うべきもの」を集約
- これにより、同期時の取り込みとBI表示で**判定ロジックの二重実装を防ぐ**

### 3.4 scripts — CLI群

- `scripts/sync/`: 同期CLI（[data-sync-design.md §2](./data-sync-design.md#2-同期cliの全体フロー)）
- `scripts/deploy-collector/`: collector.sh と設置CLI（[data-sync-design.md §4](./data-sync-design.md#4-deploy-collector-cli)）
- `tsx` で実行。Next.jsランタイムに依存しない（`src/shared` のみ import）

---

## 4. RSC境界とデータフロー

```
[SQLite(read-only)]
      │  lib/db/queries（server-only, SQLで絞り込み・ソート）
      ▼
[lib/aggregation]（JST変換・粒度正規化・状態評価・欠測/今日までの軸）※すべてServer
      │  確定済みデータ（プレーンな配列/オブジェクト）
      ▼
[app/*/page.tsx]（Server Component）
      │  props
      ▼
[components/charts/*]（"use client" Rechartsラッパー） / [components/ui/*]
```

- **フィルタ操作**（粒度・期間・ワークフロー・失敗のみ 等）は
  **URL searchParams**を更新 → サーバーが再クエリ（[api-design.md §1.1](./api-design.md#11-rsc境界の原則)）
- クライアントに全件を送ってJSでフィルタしない

---

## 5. レンダリング戦略（force-dynamic）

- **全ページで `export const dynamic = "force-dynamic"` を必須**とする
  （[Next.jsスペシャリスト助言]）
- 理由: 静的レンダリングだとビルド時のDBスナップショットが焼き付く。
  本アプリは「手元の最新データを毎回読む」のが本質なので、常に動的レンダリングにする
- `output: "export"` 禁止・Route HandlerへのEdge Runtime指定禁止
  （[api-design.md §2.3](./api-design.md#23-nextconfigts-必須設定)）

---

## 6. 状態管理

- **サーバー状態（表示データ）**: RSCが握る。クライアント状態管理ライブラリ（Redux等）は導入しない（YAGNI）
- **URL状態（フィルタ）**: searchParams が唯一の情報源（共有・リロードで再現可能）
- **クライアントローカル状態**: 同期進捗の購読（SSE受信中のバッファ）、
  チャートのホバー/ズーム等、UIの一時状態のみ `useState`
- グローバルなクライアント状態は持たない

---

## 7. ナビゲーション

- ルートレイアウト（`app/layout.tsx`）に固定サイドナビ/ヘッダを置き、6画面へのリンクを並べる
  （[frontend-design.md §レイアウト](./frontend-design.md#2-共通レイアウト)）
- リンクは `next/link`。各ページはforce-dynamicで都度サーバーレンダリング

---

## 8. 設計判断

- **フラット構成・ルートグループなし**: 6画面・単一ユーザーには十分。過剰な階層化を避ける
- **src/sharedの分離**: 同期CLIとBIで判定ロジック（JST・状態評価・スキーマ）を共有する要請が
  明確にあるため、Next.js非依存の純粋層を独立させた（Next.jsスペシャリスト助言）
- **クライアント状態管理ライブラリ非導入**: RSC + URL状態で必要十分（YAGNI）
- **scripts配下をtsxで実行**: ビルド不要で開発しやすく、`src/shared` を直接importできる
