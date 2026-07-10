/**
 * 同期CLIの設定値（gcloud接続先・ローカルパス）。
 *
 * 本番サーバーの接続先（project/zone/instance）は docs/requirements.md §2
 * （2026-07-07実サーバー調査結果）に基づく確定値。環境変数での上書きを許容し、
 * テスト・将来のサーバー変更に対応できるようにする。
 */

import os from "os";
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

/**
 * collect-metricsフェーズ（Phase 5）の設定値。
 *
 * docs/design/data-sync-design.md §5 Phase 5 / §3.4 準拠。
 * 方式D（cronファイル）のリモートパス・想定collectorバージョン・
 * GCP Monitoring（方式C）の遡り日数を持つ。
 */
export interface CollectMetricsConfig {
  /** VM上のcollector出力ファイルの絶対パス（docs/design/data-sync-design.md §3.1）。 */
  remoteCollectorFilePath: string;
  /**
   * リポジトリ側が想定するcollectorのバージョン識別子。
   *
   * **独自判断**: 設計上は `src/shared/collector/version.ts` に置く想定
   * （§3.4）だが、本タスクの担当領域が `scripts/sync/**` に限定されるため、
   * ここに定数として保持する（deploy-collector側のバージョンと合わせて
   * 将来 `src/shared` へ集約することが望ましい）。
   */
  expectedCollectorVersion: string;
  /** collector出力ファイルの取得先ローカル一時パス（取り込み後に削除する）。 */
  localCollectorTmpPath: string;
  /**
   * GCP Monitoring（方式C）から遡って取得する最大日数。
   * `cpu_metrics` に既存データが無い場合の開始時刻に使う
   * （要件 §5.1: 過去6週間まで遡れる）。
   */
  cpuMetricsLookbackDays: number;
}

/**
 * 既定のcollect-metrics設定。環境変数で上書き可能（テスト・運用調整用）。
 */
export function getDefaultCollectMetricsConfig(): CollectMetricsConfig {
  return {
    remoteCollectorFilePath:
      process.env.N8N_SYNC_REMOTE_COLLECTOR_FILE ??
      "/root/insights_collector/metrics.jsonl",
    expectedCollectorVersion:
      process.env.N8N_SYNC_COLLECTOR_VERSION ?? "collector-1",
    localCollectorTmpPath: path.join(
      os.tmpdir(),
      "n8n-insights-viewer-collector-metrics.jsonl",
    ),
    cpuMetricsLookbackDays: 42,
  };
}
