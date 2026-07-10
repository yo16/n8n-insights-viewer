/**
 * 同期CLIの設定値（gcloud接続先・ローカルパス）。
 *
 * 本番サーバーの接続先（project/zone/instance）は docs/requirements.md §2
 * （2026-07-07実サーバー調査結果）に基づく確定値。環境変数での上書きを許容し、
 * テスト・将来のサーバー変更に対応できるようにする。
 */

import path from "path";

/** gcloud接続先・リモートパスの設定。 */
export interface GcloudSyncConfig {
  /** GCPプロジェクトID */
  project: string;
  /** GCEインスタンスのゾーン */
  zone: string;
  /** GCEインスタンス名 */
  instance: string;
  /** 本番サーバー上のdatabase.sqliteの絶対パス */
  remoteDbPath: string;
  /** 本番サーバー上の一時作業ディレクトリ（同期のたびに作成・削除する） */
  remoteTmpDir: string;
}

/**
 * 既定のgcloud接続設定。
 * 環境変数（`N8N_SYNC_GCLOUD_*`）で上書き可能（テスト・サーバー変更時用）。
 */
export function getDefaultGcloudSyncConfig(): GcloudSyncConfig {
  return {
    project: process.env.N8N_SYNC_GCLOUD_PROJECT ?? "automation-n8n-445800",
    zone: process.env.N8N_SYNC_GCLOUD_ZONE ?? "us-central1-c",
    instance:
      process.env.N8N_SYNC_GCLOUD_INSTANCE ??
      "instance-20241225-025109-n8n",
    remoteDbPath:
      process.env.N8N_SYNC_REMOTE_DB_PATH ?? "/root/n8n/.n8n/database.sqlite",
    remoteTmpDir:
      process.env.N8N_SYNC_REMOTE_TMP_DIR ?? "/tmp/n8n_insights_sync",
  };
}

/** リポジトリルート（scripts/sync/config.ts からの相対位置）。 */
const REPO_ROOT = path.resolve(__dirname, "..", "..");

/** 生コピーの保存先ディレクトリ（docs/design/app-architecture.md §2）。 */
export const LOCAL_RAW_DIR = path.join(REPO_ROOT, "data", "raw");

/** 生コピー: database.sqlite のローカルパス。 */
export const LOCAL_RAW_DB_PATH = path.join(LOCAL_RAW_DIR, "database.sqlite");

/** 生コピー: database.sqlite-wal のローカルパス。 */
export const LOCAL_RAW_WAL_PATH = path.join(
  LOCAL_RAW_DIR,
  "database.sqlite-wal",
);

/** 蓄積DB（閲覧用SQLite）のローカルパス。 */
export const LOCAL_ACCUMULATION_DB_PATH = path.join(
  REPO_ROOT,
  "data",
  "n8n_insights.sqlite",
);
