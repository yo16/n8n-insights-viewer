# src/lib

Server専用ロジック。`import "server-only"` を徹底し、クライアントバンドルへ
混入させない。詳細は `docs/design/app-architecture.md` §3.2、
`docs/design/api-design.md` を参照。

- `db/connection.ts` — better-sqlite3のread-onlyオープン + グローバルシングルトン
- `db/queries/` — 画面別クエリ関数（dashboard / insights / workflows / executions /
  machine / sync）。SQLで絞り込み・ソートを行う
- `aggregation/` — JST変換・粒度正規化・状態評価・トレンド算出などの集計ロジック
- `datetime/` — Server側の日時ヘルパ（純粋部分は `src/shared/datetime` を利用）
- `config/` — `config/thresholds.json` の読み込み + zod検証（毎リクエスト読み込み）
- `sync-process/` — Route Handlerから使う同期CLIの子プロセス管理

本実装は後続タスクで追加する。このディレクトリ構成は雛形（tz8）として作成したもの。
