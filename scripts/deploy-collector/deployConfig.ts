/**
 * deploy-collector CLIの設定値（設置先パス・cron分・collectorバージョン）。
 *
 * docs/design/data-sync-design.md §3.1/§4、docs/requirements.md §5.3 準拠。
 * 出力ファイルパス・想定collectorバージョンは `scripts/sync/config.ts` の
 * `getDefaultCollectMetricsConfig()` と共有する（同一の値を同期CLI側でも
 * 参照するため。二重管理を避ける）。
 */

import path from "path";

import {
  getDefaultCollectMetricsConfig,
  getDefaultGcloudSyncConfig,
} from "../sync/config";

/** VM上に設置するスクリプトのファイル名。 */
export const COLLECTOR_SCRIPT_FILENAME = "collector.sh";

/**
 * crontabの実行分（毎時）。
 *
 * **分は00を避ける**（docs/requirements.md §5.3: ワークフローのスケジュール実行と
 * 重ねないため）。17分に固定する。
 */
export const CRON_MINUTE = 17;

/** deploy-collectorの設置設定。 */
export interface DeployCollectorConfig {
  /** VM上の専用ディレクトリ（例: `/root/insights_collector`）。 */
  remoteDir: string;
  /** VM上のcollector.shの絶対パス。 */
  remoteScriptPath: string;
  /** VM上の出力ファイル(metrics.jsonl)の絶対パス。 */
  remoteOutputPath: string;
  /** スクリプトに埋め込むバージョン識別子（同期CLI側の期待値と同一）。 */
  collectorVersion: string;
  /** 本番n8nのdatabase.sqliteの絶対パス。 */
  remoteDbPath: string;
  /** crontabの実行分。 */
  cronMinute: number;
  /** crontabへ追加/更新する1行。 */
  cronLine: string;
}

/**
 * 既定のdeploy-collector設定を組み立てる。
 * `scripts/sync/config.ts` の環境変数上書き（`N8N_SYNC_*`）にも自動的に追従する。
 */
export function getDefaultDeployCollectorConfig(): DeployCollectorConfig {
  const collectMetricsConfig = getDefaultCollectMetricsConfig();
  const gcloudConfig = getDefaultGcloudSyncConfig();

  const remoteOutputPath = collectMetricsConfig.remoteCollectorFilePath;
  const remoteDir = path.posix.dirname(remoteOutputPath);
  const remoteScriptPath = path.posix.join(
    remoteDir,
    COLLECTOR_SCRIPT_FILENAME,
  );
  const cronLine = `${CRON_MINUTE} * * * * ${remoteScriptPath}`;

  return {
    remoteDir,
    remoteScriptPath,
    remoteOutputPath,
    collectorVersion: collectMetricsConfig.expectedCollectorVersion,
    remoteDbPath: gcloudConfig.remoteDbPath,
    cronMinute: CRON_MINUTE,
    cronLine,
  };
}
