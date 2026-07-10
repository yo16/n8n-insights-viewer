# src/shared

Next.js非依存の純粋TypeScript層。**同期CLI（`scripts/`, tsx実行）とアプリの双方から
相対importで使う**。Next.js API・`server-only`・`fs`等には依存させない
（純粋関数・型・zodスキーマのみ）。詳細は `docs/design/app-architecture.md` §3.3。

- `datetime/` — JST変換（UTC+9固定オフセット。`getUTC*`系のみ使用し、
  実行端末のローカルTZに依存させない）
- `status/` — 状態評価（正常/注意/危険）の純粋関数。閾値は引数で受け取る
- `n8n-schema/` — 想定されるn8n DBスキーマの定義（zod）
- `collector/` — マシン負荷収集スクリプトの出力パース・バージョン定数
- `sync/` — 同期の進捗イベントschema・未同期判定ロジック
- `types/` — 同期CLIとアプリで共有する型定義

同期時の取り込みとBI表示で判定ロジックの二重実装を防ぐための層。
本実装は後続タスクで追加する。このディレクトリ構成は雛形（tz8）として作成したもの。
