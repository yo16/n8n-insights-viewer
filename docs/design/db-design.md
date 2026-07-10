# DB設計 — ローカル蓄積DB（閲覧用SQLite）

## 関連ドキュメント

- [設計概要](./overview.md)
- [データ同期設計](./data-sync-design.md) — 本DBへの書き込み（同期CLI・収集スクリプト）
- [データアクセス層設計](./api-design.md) — 本DBの読み取り（better-sqlite3, read-only）
- [セキュリティ設計](./security-design.md) — 機微テーブルの除去・生コピー削除
- [要件定義 §3 データソース](../requirements.md) / [§4.3 同期頻度・履歴保全](../requirements.md) / [§6.2 表示上の注意](../requirements.md)

---

## 1. 概要

本アプリが参照する唯一のデータストアは、ローカルの閲覧用SQLite
`data/n8n_insights.sqlite` である。本番n8nサーバーのDBには一切接続しない
（[要件 §4方式A](../requirements.md)）。

このDBは2系統のデータを持つ:

1. **n8n由来テーブル**（5種）: 本番DBの生コピーから必要テーブルのみを抽出したもの
2. **自前テーブル**（マシン負荷・OOM・同期履歴）: 収集スクリプト/同期CLIが生成するもの

### 1.1 設計方針

- **WALモードで作成する**: 同期CLI（書き込み）とBI（読み取り）が同時に走りうるため。
  作成時に `PRAGMA journal_mode = WAL;` を一度実行する（[設計判断: WAL採用](#8-設計判断)）
- **アプリはread-onlyで開く**: `{ readonly: true, fileMustExist: true }` + `PRAGMA query_only = ON`
  （[api-design.md](./api-design.md#2-接続管理) 参照）
- **UTC保存・JST変換は表示側**: DB内の日時カラムはすべてUTCの文字列（ISO8601）または
  n8n由来の元の値をそのまま保持する。JST変換は集計層（`src/lib/aggregation`）で行い、
  DBには持ち込まない（[要件 §6.2](../requirements.md)）
- **取り込み方針は「上書き」と「追記(UPSERT)」を明確に分ける**（[§4](#4-取り込みマッピング更新戦略)）

### 1.2 命名規約

- n8n由来テーブルは **n8n側の物理名をそのまま使う**（`insights_by_period` 等）。
  マッピングの追跡性を保つため
- 自前テーブルは `snake_case` の独自命名とし、n8nと衝突しない接頭辞は付けない
  （同一DB内だが役割はコメントで区別）

---

## 2. スキーマ全体像（ER概要）

```
insights_metadata (metaId PK)
      ▲ 1
      │ metaId (FK, 論理)
      │ *
insights_by_period ─────────── 主データソース（実行数・成功/失敗・実行時間の期間集計）

workflow_entity (id PK) ── ワークフローマスタ（active判定）
workflow_statistics (workflowId, name) ── 生涯累計カウンタ
execution_entity (id PK) ── 直近実行明細（ローカルに追記蓄積）

--- 自前テーブル ---
machine_metrics (id PK, ts_utc, source) ── メモリ/swap/load/DBサイズ/FS
container_stats (id PK, ts_utc, container) ── docker stats（コンテナ別CPU/メモリ）
cpu_metrics (id PK, ts_utc) ── GCP Monitoring由来のCPU使用率（連続）
oom_events (id PK, occurred_at_utc) ── OOMイベント
sync_history (id PK, started_at) ── 同期実行の履歴
schema_meta (key PK) ── 本DBのスキーマバージョン・想定n8nスキーマ指紋
```

---

## 3. テーブル定義

### 3.1 n8n由来テーブル

n8n側のスキーマは `latest` タグ運用のため変わりうる。**同期時にスキーマ検証を行い**、
想定と差異があれば取り込みを中断する（[data-sync-design.md §validate](./data-sync-design.md#43-phase-2-validate)）。
以下は 2026-07 時点（n8n v2.27.4）の想定スキーマ。

#### insights_by_period（主データソース・上書き）

```sql
CREATE TABLE insights_by_period (
  metaId      INTEGER NOT NULL,       -- insights_metadata.metaId への論理FK
  type        INTEGER NOT NULL,       -- 0=time_saved_min / 1=runtime_ms / 2=success / 3=failure
  value       INTEGER NOT NULL,       -- 集計値
  periodUnit  INTEGER NOT NULL,       -- 0=hour / 1=day / 2=week
  periodStart TEXT    NOT NULL,       -- 期間開始（UTC, ISO8601）
  PRIMARY KEY (metaId, type, periodUnit, periodStart)
);
CREATE INDEX idx_ibp_period ON insights_by_period(periodUnit, periodStart);
CREATE INDEX idx_ibp_meta   ON insights_by_period(metaId);
```

- n8n側は自動採番id列を持つが、閲覧用途では不要なため落とし、
  意味的な複合キーを主キーにする（重複取り込み防止も兼ねる）
- `type=0`（time_saved_min）は現状全て0だが、将来データが入りうるので取り込みは行い、
  表示側で「値ありのときのみ表示」する（[要件 §6.2](../requirements.md)）

#### insights_metadata（上書き）

```sql
CREATE TABLE insights_metadata (
  metaId       INTEGER PRIMARY KEY,
  workflowId   TEXT,                  -- 削除後はNULLになりうる（ON DELETE SET NULL）
  workflowName TEXT,                  -- ワークフロー削除後も名前は残る
  projectName  TEXT
);
```

#### workflow_entity（上書き）

```sql
CREATE TABLE workflow_entity (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  active    INTEGER NOT NULL,         -- 0/1
  createdAt TEXT,                     -- UTC
  updatedAt TEXT                      -- UTC
);
```

- 一覧表示・アクティブ判定に使用。credentials等の重い/機微なカラムは取り込まない

#### workflow_statistics（上書き）

```sql
CREATE TABLE workflow_statistics (
  workflowId TEXT NOT NULL,
  name       TEXT NOT NULL,           -- production_success / production_error / manual_success / manual_error 等
  count      INTEGER NOT NULL,        -- 生涯累計（pruneの影響を受けない）
  latestEvent TEXT,                   -- UTC（あれば）
  PRIMARY KEY (workflowId, name)
);
```

#### execution_entity（**追記UPSERT**・ローカルに履歴蓄積）

```sql
CREATE TABLE execution_entity (
  id          INTEGER PRIMARY KEY,    -- n8n側の実行ID
  workflowId  TEXT,
  status      TEXT,                   -- success / error / running / waiting 等
  mode        TEXT,                   -- trigger / manual / webhook 等
  startedAt   TEXT,                   -- UTC
  stoppedAt   TEXT,                   -- UTC
  createdAt   TEXT,                   -- UTC
  finished    INTEGER,                -- 0/1
  ingestedAt  TEXT NOT NULL           -- 本DBに取り込んだ時刻（UTC, 監査用）
);
CREATE INDEX idx_exec_workflow ON execution_entity(workflowId);
CREATE INDEX idx_exec_started  ON execution_entity(startedAt);
CREATE INDEX idx_exec_status   ON execution_entity(status);
```

- 本番側は7日/5000件でpruneされるため、**同期のたびにUPSERTで追記**し、
  7日を超える明細を自前で永続化する（[要件 §4.3](../requirements.md)）
- `data`（実行の入出力JSON）は機微情報を含みうるうえ巨大なため**取り込まない**
  （[security-design.md](./security-design.md)）

### 3.2 自前テーブル

#### machine_metrics（追記UPSERT）— メモリ/swap/load/DBサイズ/FS

```sql
CREATE TABLE machine_metrics (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_utc           TEXT NOT NULL,     -- 収集時刻（UTC, ISO8601）
  source           TEXT NOT NULL,     -- 'cron'(方式D) / 'spot'(方式B・同期時スポット)
  mem_total_kb     INTEGER,
  mem_available_kb INTEGER,           -- OOM予兆の主指標
  mem_free_kb      INTEGER,
  swap_total_kb    INTEGER,
  swap_free_kb     INTEGER,           -- swap使用量 = total - free
  loadavg_1        REAL,
  loadavg_5        REAL,
  loadavg_15       REAL,
  db_size_bytes    INTEGER,           -- database.sqlite
  wal_size_bytes   INTEGER,           -- database.sqlite-wal
  rootfs_avail_bytes INTEGER,
  collector_version TEXT,             -- 方式Dの出力に含まれるバージョン識別子（spotはCLI版）
  UNIQUE (ts_utc, source)
);
CREATE INDEX idx_mm_ts ON machine_metrics(ts_utc);
```

- `source='cron'` は方式D（1時間粒度の連続データ）、`source='spot'` は方式B（同期時1サンプル）
- `UNIQUE(ts_utc, source)` により、cronファイルの再回収時も重複しない（UPSERT）
- swap使用量・memの傾き算出は集計層で行う（DBは生値のみ保持）

#### container_stats（追記UPSERT）— docker stats

```sql
CREATE TABLE container_stats (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_utc         TEXT NOT NULL,
  source         TEXT NOT NULL,       -- 'cron' / 'spot'
  container_name TEXT NOT NULL,       -- n8n / traefik 等
  cpu_pct        REAL,                -- docker stats のCPU%
  mem_usage_bytes INTEGER,
  mem_limit_bytes INTEGER,
  UNIQUE (ts_utc, source, container_name)
);
CREATE INDEX idx_cs_ts ON container_stats(ts_utc);
```

- machine_metricsと1:N。docker statsはコンテナ別のため縦持ちで分離
  （[設計判断: docker statsを別テーブル化](#8-設計判断)）

#### cpu_metrics（追記UPSERT）— GCP Monitoring由来のCPU使用率（連続）

```sql
CREATE TABLE cpu_metrics (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_utc      TEXT NOT NULL,          -- Monitoringのサンプル時刻（UTC）
  cpu_util    REAL NOT NULL,          -- 0.0〜1.0 のインスタンスCPU使用率
  UNIQUE (ts_utc)
);
CREATE INDEX idx_cpu_ts ON cpu_metrics(ts_utc);
```

- 方式C。過去6週間まで遡れるため、方式D設置前やcron停止期間のCPUを補完する
  （[要件 §5.1](../requirements.md)）。メモリ/swapとは粒度・出所が異なるため別テーブル

#### oom_events（追記UPSERT）— OOMイベント

```sql
CREATE TABLE oom_events (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at_utc TEXT NOT NULL,      -- OOM発生時刻（UTC）
  killed_process TEXT,                -- kill対象プロセス名（例: node）
  source        TEXT NOT NULL,        -- 'journalctl' / 'kern.log'
  raw_line      TEXT,                 -- 元ログ1行（証跡）
  discovered_at TEXT NOT NULL,        -- 同期で検知した時刻（UTC）
  UNIQUE (occurred_at_utc, killed_process)
);
CREATE INDEX idx_oom_ts ON oom_events(occurred_at_utc);
```

- 永続ログ（`journalctl -k` / `/var/log/kern.log*`）から回収するため、
  再起動をまたいだOOMも後から取り込める（[要件 §5.1](../requirements.md)）
- チャート上のマーカー・「実際に落ちた水準」の比較に使う（[要件 §6.3](../requirements.md)）

#### sync_history（追記）— 同期実行の履歴

```sql
CREATE TABLE sync_history (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at     TEXT NOT NULL,       -- UTC
  finished_at    TEXT,                -- UTC（失敗中断時はNULLありうる）
  status         TEXT NOT NULL,       -- 'running' / 'success' / 'failed' / 'aborted'
  phase_reached  TEXT,                -- 到達した最終フェーズ名（fetch/validate/…/cleanup）
  integrity_ok   INTEGER,             -- PRAGMA quick_check 結果（0/1）
  schema_ok      INTEGER,             -- スキーマ検証結果（0/1）
  rows_ingested_json TEXT,            -- {"insights_by_period":2077,"execution_entity":202,...}
  collector_version_seen TEXT,        -- 回収したcronファイルのバージョン
  error_message  TEXT,                -- 失敗時のメッセージ
  raw_copy_deleted INTEGER            -- 生コピー削除の完了フラグ（0/1, セキュリティ監査用）
);
CREATE INDEX idx_sync_started ON sync_history(started_at);
```

- 同期ステータス画面（[frontend-design.md 画面6](./frontend-design.md#画面6-同期ステータス)）の主データ源
- `raw_copy_deleted` は生コピー削除の徹底を監査するための明示フラグ
  （[security-design.md](./security-design.md#3-生コピー削除の保証)）

#### schema_meta（管理テーブル）

```sql
CREATE TABLE schema_meta (
  key   TEXT PRIMARY KEY,             -- 'db_schema_version' / 'n8n_schema_fingerprint' / 'created_at'
  value TEXT NOT NULL
);
```

- 本DB自身のスキーマバージョン管理と、検証に使うn8n側スキーマ指紋の保存に使う

---

## 4. 取り込みマッピング・更新戦略

n8n生コピー（`data/raw/database.sqlite`）→ 閲覧用DBへの抽出時の対応。
詳細フローは [data-sync-design.md §4.5 ingest](./data-sync-design.md#45-phase-4-ingest)。

| 閲覧用テーブル | n8n元テーブル | 戦略 | キー | 理由 |
|---|---|---|---|---|
| insights_by_period | insights_by_period | **全置換**（DELETE→INSERT） | (metaId,type,periodUnit,periodStart) | 長期保持され本番が正。手元は本番のミラーでよい |
| insights_metadata | insights_metadata | **全置換** | metaId | 同上（マスタ的） |
| workflow_entity | workflow_entity | **全置換** | id | マスタ。最新状態が正 |
| workflow_statistics | workflow_statistics | **全置換** | (workflowId,name) | 累計値。最新値で置換 |
| execution_entity | execution_entity | **UPSERT（追記）** | id | 7日でpruneされるため手元に蓄積が必要 |
| machine_metrics | （n8n外） | UPSERT | (ts_utc,source) | 収集スクリプト由来 |
| container_stats | （n8n外） | UPSERT | (ts_utc,source,container) | 同上 |
| cpu_metrics | （n8n外・GCP Monitoring） | UPSERT | ts_utc | 同上 |
| oom_events | （n8n外・カーネルログ） | UPSERT | (occurred_at_utc,killed_process) | 同上 |

### 4.1 全置換テーブルのトランザクション

全置換は必ず単一トランザクションで `DELETE FROM t; INSERT ...;` を行い、
途中失敗時は自動ロールバックする。読み取り中のBIが「空のテーブル」を見ないようにする
（WAL + トランザクションで一貫性を担保）。

### 4.2 粒度混在への非対応（DBは生のまま）

`insights_by_period` の hour/day/week 混在（[要件 §6.2](../requirements.md)）は
**DBでは正規化しない**。生の粒度のまま保持し、混在の吸収（dayへの正規化・JST日次区切り）は
集計層に閉じ込める（[api-design.md §集計層](./api-design.md#4-集計層aggregation)）。
DBを正規化してしまうと元データの再現性が失われるため。

---

## 5. インデックス方針

- 時系列クエリが中心のため、各時系列テーブルの時刻カラムにインデックスを張る
- `insights_by_period` は「粒度×期間」「metaId別」の2軸で引くため両方に索引
- 総行数は数千規模（insights 2,077 + execution 202 + メトリクス年間数千）と小さく、
  過度な最適化は不要（[要件 §3](../requirements.md) の件数実測）

---

## 6. DB初期化・マイグレーション

- 初回同期時、DBが無ければ `PRAGMA journal_mode=WAL` の後に全DDLを実行して作成する
- `schema_meta.db_schema_version` を持ち、将来スキーマ変更時は同期CLIが差分DDLを適用する
  （[設計判断: 素朴なバージョン番号方式](#8-設計判断)。ORMやマイグレーションツールは導入しない = YAGNI）
- DDLは `src/lib/db/schema.sql`（または `src/shared/` の純粋定数）に一元管理し、
  同期CLIとアプリ（読み取り時の存在確認）で共有する

---

## 7. read-only参照との関係

アプリ側は本DBを **read-onlyでしか開かない**（書き込みは同期CLIの専権）。
`fileMustExist: true` のため、**初回同期前にアプリを起動するとDBが無く失敗する**。
この場合は「まず `npm run sync` を実行してください」というガイドを表示する
（[api-design.md §接続失敗時](./api-design.md#25-db未作成時のハンドリング) / [frontend-design.md](./frontend-design.md)）。

---

## 8. 設計判断

要件で明示されていない点について、以下のデフォルトを採用した。

- **WAL採用**: 同期CLIの書き込みとBIの読み取りが同時発生しうる（[要件 §4.3](../requirements.md)で
  同期ボタンから起動可能）ため、ロック競合を避けるWALを採用。Next.jsスペシャリスト助言に合致
- **docker statsを別テーブル化**: コンテナ別の縦持ちが自然で、コンテナ増減にスキーマ変更なしで
  対応できるため `container_stats` を分離した
- **CPUを別テーブル(cpu_metrics)化**: 出所（GCP Monitoring）・粒度がメモリ系（方式B/D）と異なり、
  欠測補完のロジックも別軸のため分離した
- **execution_entity.dataを取り込まない**: 巨大かつ機微情報を含むため。明細画面（[要件 §6.1-4](../requirements.md)）に
  必要なのは状態・モード・所要時間のみ
- **素朴なスキーマバージョン管理**: マイグレーションツールは個人ローカル用途に過剰（YAGNI）。
  `schema_meta` + 差分DDLで足りる
- **複合キーを主キーに採用（insights_by_period等）**: 重複取り込み防止と全置換の冪等性を
  スキーマレベルで保証するため
