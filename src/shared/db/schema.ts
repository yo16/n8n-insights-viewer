/**
 * 蓄積DB（閲覧用SQLite）のDDL一元管理。
 *
 * `docs/design/db-design.md` §3 に定義された11テーブル + インデックスを
 * 定数として保持する。Next.js非依存の純粋TSであり、同期CLI（scripts/）と
 * アプリ（src/lib）の双方から相対importで利用される
 * （`docs/design/app-architecture.md` §3.3）。
 *
 * ここではDDLの文字列定義のみを扱い、DB接続の生成・実行は行わない
 * （それは `src/shared/db/init.ts` および呼び出し側の責務）。
 */

/**
 * 本DBのスキーマバージョン。
 * `schema_meta` テーブルの `db_schema_version` に記録される値。
 * スキーマに破壊的変更を加える場合はこの値をインクリメントし、
 * `init.ts` 側に差分マイグレーションを追加する。
 */
export const DB_SCHEMA_VERSION = 1;

/**
 * schema_meta のキー定数。
 */
export const SCHEMA_META_KEYS = {
  DB_SCHEMA_VERSION: "db_schema_version",
  N8N_SCHEMA_FINGERPRINT: "n8n_schema_fingerprint",
  CREATED_AT: "created_at",
} as const;

// ─────────────────────────────────────────────
// 3.1 n8n由来テーブル
// ─────────────────────────────────────────────

/** insights_by_period（主データソース・上書き） */
export const CREATE_TABLE_INSIGHTS_BY_PERIOD = `
CREATE TABLE IF NOT EXISTS insights_by_period (
  metaId      INTEGER NOT NULL,
  type        INTEGER NOT NULL,
  value       INTEGER NOT NULL,
  periodUnit  INTEGER NOT NULL,
  periodStart TEXT    NOT NULL,
  PRIMARY KEY (metaId, type, periodUnit, periodStart)
);
`.trim();

export const CREATE_INDEX_IBP_PERIOD = `
CREATE INDEX IF NOT EXISTS idx_ibp_period ON insights_by_period(periodUnit, periodStart);
`.trim();

export const CREATE_INDEX_IBP_META = `
CREATE INDEX IF NOT EXISTS idx_ibp_meta ON insights_by_period(metaId);
`.trim();

/** insights_metadata（上書き） */
export const CREATE_TABLE_INSIGHTS_METADATA = `
CREATE TABLE IF NOT EXISTS insights_metadata (
  metaId       INTEGER PRIMARY KEY,
  workflowId   TEXT,
  workflowName TEXT,
  projectName  TEXT
);
`.trim();

/** workflow_entity（上書き） */
export const CREATE_TABLE_WORKFLOW_ENTITY = `
CREATE TABLE IF NOT EXISTS workflow_entity (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  active    INTEGER NOT NULL,
  createdAt TEXT,
  updatedAt TEXT
);
`.trim();

/** workflow_statistics（上書き） */
export const CREATE_TABLE_WORKFLOW_STATISTICS = `
CREATE TABLE IF NOT EXISTS workflow_statistics (
  workflowId  TEXT NOT NULL,
  name        TEXT NOT NULL,
  count       INTEGER NOT NULL,
  latestEvent TEXT,
  PRIMARY KEY (workflowId, name)
);
`.trim();

/** execution_entity（追記UPSERT・ローカルに履歴蓄積） */
export const CREATE_TABLE_EXECUTION_ENTITY = `
CREATE TABLE IF NOT EXISTS execution_entity (
  id          INTEGER PRIMARY KEY,
  workflowId  TEXT,
  status      TEXT,
  mode        TEXT,
  startedAt   TEXT,
  stoppedAt   TEXT,
  createdAt   TEXT,
  finished    INTEGER,
  ingestedAt  TEXT NOT NULL
);
`.trim();

export const CREATE_INDEX_EXEC_WORKFLOW = `
CREATE INDEX IF NOT EXISTS idx_exec_workflow ON execution_entity(workflowId);
`.trim();

export const CREATE_INDEX_EXEC_STARTED = `
CREATE INDEX IF NOT EXISTS idx_exec_started ON execution_entity(startedAt);
`.trim();

export const CREATE_INDEX_EXEC_STATUS = `
CREATE INDEX IF NOT EXISTS idx_exec_status ON execution_entity(status);
`.trim();

// ─────────────────────────────────────────────
// 3.2 自前テーブル
// ─────────────────────────────────────────────

/** machine_metrics（追記UPSERT）— メモリ/swap/load/DBサイズ/FS */
export const CREATE_TABLE_MACHINE_METRICS = `
CREATE TABLE IF NOT EXISTS machine_metrics (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_utc             TEXT NOT NULL,
  source             TEXT NOT NULL,
  mem_total_kb       INTEGER,
  mem_available_kb   INTEGER,
  mem_free_kb        INTEGER,
  swap_total_kb      INTEGER,
  swap_free_kb       INTEGER,
  loadavg_1          REAL,
  loadavg_5          REAL,
  loadavg_15         REAL,
  db_size_bytes      INTEGER,
  wal_size_bytes     INTEGER,
  rootfs_avail_bytes INTEGER,
  collector_version  TEXT,
  UNIQUE (ts_utc, source)
);
`.trim();

export const CREATE_INDEX_MM_TS = `
CREATE INDEX IF NOT EXISTS idx_mm_ts ON machine_metrics(ts_utc);
`.trim();

/** container_stats（追記UPSERT）— docker stats */
export const CREATE_TABLE_CONTAINER_STATS = `
CREATE TABLE IF NOT EXISTS container_stats (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_utc          TEXT NOT NULL,
  source          TEXT NOT NULL,
  container_name  TEXT NOT NULL,
  cpu_pct         REAL,
  mem_usage_bytes INTEGER,
  mem_limit_bytes INTEGER,
  UNIQUE (ts_utc, source, container_name)
);
`.trim();

export const CREATE_INDEX_CS_TS = `
CREATE INDEX IF NOT EXISTS idx_cs_ts ON container_stats(ts_utc);
`.trim();

/** cpu_metrics（追記UPSERT）— GCP Monitoring由来のCPU使用率（連続） */
export const CREATE_TABLE_CPU_METRICS = `
CREATE TABLE IF NOT EXISTS cpu_metrics (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_utc   TEXT NOT NULL,
  cpu_util REAL NOT NULL,
  UNIQUE (ts_utc)
);
`.trim();

export const CREATE_INDEX_CPU_TS = `
CREATE INDEX IF NOT EXISTS idx_cpu_ts ON cpu_metrics(ts_utc);
`.trim();

/** oom_events（追記UPSERT）— OOMイベント */
export const CREATE_TABLE_OOM_EVENTS = `
CREATE TABLE IF NOT EXISTS oom_events (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at_utc TEXT NOT NULL,
  killed_process  TEXT,
  source          TEXT NOT NULL,
  raw_line        TEXT,
  discovered_at   TEXT NOT NULL,
  UNIQUE (occurred_at_utc, killed_process)
);
`.trim();

export const CREATE_INDEX_OOM_TS = `
CREATE INDEX IF NOT EXISTS idx_oom_ts ON oom_events(occurred_at_utc);
`.trim();

/** sync_history（追記）— 同期実行の履歴 */
export const CREATE_TABLE_SYNC_HISTORY = `
CREATE TABLE IF NOT EXISTS sync_history (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at             TEXT NOT NULL,
  finished_at            TEXT,
  status                 TEXT NOT NULL,
  phase_reached          TEXT,
  integrity_ok           INTEGER,
  schema_ok              INTEGER,
  rows_ingested_json     TEXT,
  collector_version_seen TEXT,
  error_message          TEXT,
  raw_copy_deleted       INTEGER
);
`.trim();

export const CREATE_INDEX_SYNC_STARTED = `
CREATE INDEX IF NOT EXISTS idx_sync_started ON sync_history(started_at);
`.trim();

/** schema_meta（管理テーブル） */
export const CREATE_TABLE_SCHEMA_META = `
CREATE TABLE IF NOT EXISTS schema_meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`.trim();

// ─────────────────────────────────────────────
// 実行順序を保持したDDL一覧
// ─────────────────────────────────────────────

/**
 * 初期化時に実行するDDLの一覧（テーブル作成→インデックス作成の順）。
 * `init.ts` はこの配列を順に実行するのみで、DDL内容自体はここに一元化する。
 */
export const SCHEMA_DDL_STATEMENTS: readonly string[] = [
  CREATE_TABLE_INSIGHTS_BY_PERIOD,
  CREATE_INDEX_IBP_PERIOD,
  CREATE_INDEX_IBP_META,

  CREATE_TABLE_INSIGHTS_METADATA,

  CREATE_TABLE_WORKFLOW_ENTITY,

  CREATE_TABLE_WORKFLOW_STATISTICS,

  CREATE_TABLE_EXECUTION_ENTITY,
  CREATE_INDEX_EXEC_WORKFLOW,
  CREATE_INDEX_EXEC_STARTED,
  CREATE_INDEX_EXEC_STATUS,

  CREATE_TABLE_MACHINE_METRICS,
  CREATE_INDEX_MM_TS,

  CREATE_TABLE_CONTAINER_STATS,
  CREATE_INDEX_CS_TS,

  CREATE_TABLE_CPU_METRICS,
  CREATE_INDEX_CPU_TS,

  CREATE_TABLE_OOM_EVENTS,
  CREATE_INDEX_OOM_TS,

  CREATE_TABLE_SYNC_HISTORY,
  CREATE_INDEX_SYNC_STARTED,

  CREATE_TABLE_SCHEMA_META,
];

/**
 * 全テーブル名（存在検証・テストで利用）。
 */
export const ALL_TABLE_NAMES: readonly string[] = [
  "insights_by_period",
  "insights_metadata",
  "workflow_entity",
  "workflow_statistics",
  "execution_entity",
  "machine_metrics",
  "container_stats",
  "cpu_metrics",
  "oom_events",
  "sync_history",
  "schema_meta",
];
