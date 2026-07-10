/**
 * 同期CLIのフェーズランナー。
 *
 * docs/design/data-sync-design.md §2 の6フェーズ
 * （fetch→validate→extract→ingest→collect-metrics→cleanup）を順次実行し、
 * `sync_history` へ記録する。
 *
 * - extract/ingestはBeadsタスク「shu」で実装済み
 * - collect-metricsはBeadsタスク「8k8」で実装済み。個別ステップの失敗は
 *   フェーズ内で警告として吸収され、同期全体を失敗させない
 *   （docs/design/data-sync-design.md §5 Phase 5）
 * - cleanupは、どのフェーズで失敗しても必ず実行する（try/finally相当。
 *   docs/design/security-design.md §3）
 */

import { ValidateError } from "./errors";
import type { CommandRunner } from "./commandRunner";
import {
  LOCAL_ACCUMULATION_DB_PATH,
  getDefaultCollectMetricsConfig,
  type CollectMetricsConfig,
  type GcloudSyncConfig,
} from "./config";
import {
  defaultFetchPhaseOptions,
  runFetchPhase,
  type FetchPhaseOptions,
} from "./phases/fetchPhase";
import { runValidatePhase } from "./phases/validatePhase";
import { runExtractPhase } from "./phases/extractPhase";
import { runIngestPhase } from "./phases/ingestPhase";
import { runCollectMetricsPhase } from "./phases/collectMetricsPhase";
import { runCleanupPhase } from "./phases/cleanupPhase";
import { emitResult, logHuman, type ResultStatus, type SyncPhase } from "./progress";
import {
  finishSyncHistory,
  openAccumulationDbForWrite,
  startSyncHistory,
} from "./syncHistory";

/** `runSync` の実行オプション。 */
export interface RunSyncOptions {
  /** コマンド実行層（実運用では `GcloudCommandRunner`、テストではフェイクを注入）。 */
  commandRunner: CommandRunner;
  /** fetchフェーズの設定（gcloud接続先・ローカルパス）。省略時は既定値。 */
  fetchOptions?: FetchPhaseOptions;
  /** collect-metricsフェーズの設定。省略時は既定値。 */
  collectMetricsConfig?: CollectMetricsConfig;
  /** 蓄積DBのパス。省略時は既定値（`data/n8n_insights.sqlite`）。 */
  accumulationDbPath?: string;
}

/** 同期全体の実行結果。 */
export interface SyncRunResult {
  status: ResultStatus;
  phaseReached: SyncPhase;
  errorMessage?: string;
  rowsIngested?: Record<string, number>;
}

/**
 * 同期CLIの全フェーズを順次実行する。
 *
 * fetch/validate/extract/ingest/collect-metricsを実装済みフェーズとして実行する。
 * collect-metricsの個別失敗は同期全体を失敗させない（警告として記録し継続する）。
 * cleanupはどの段階で失敗しても必ず実行する。
 */
export async function runSync(options: RunSyncOptions): Promise<SyncRunResult> {
  const fetchOptions = options.fetchOptions ?? defaultFetchPhaseOptions();
  const collectMetricsConfig =
    options.collectMetricsConfig ?? getDefaultCollectMetricsConfig();
  const accumulationDbPath =
    options.accumulationDbPath ?? LOCAL_ACCUMULATION_DB_PATH;

  const db = openAccumulationDbForWrite(accumulationDbPath);
  const historyId = startSyncHistory(db);

  let phaseReached: SyncPhase = "fetch";
  let integrityOk: boolean | undefined;
  let schemaOk: boolean | undefined;
  let errorMessage: string | undefined;
  let rowsIngested: Record<string, number> | undefined;
  let collectorVersionSeen: string | undefined;
  let status: ResultStatus = "success";

  try {
    phaseReached = "fetch";
    await runFetchPhase(options.commandRunner, fetchOptions);

    phaseReached = "validate";
    const validateResult = runValidatePhase(fetchOptions.localRawDbPath);
    integrityOk = validateResult.integrityOk;
    schemaOk = validateResult.schemaOk;

    phaseReached = "extract";
    const extracted = runExtractPhase(fetchOptions.localRawDbPath);

    phaseReached = "ingest";
    const ingestResult = runIngestPhase(db, extracted);
    rowsIngested = ingestResult.rowsIngested;

    phaseReached = "collect-metrics";
    // collect-metricsは個別ステップの失敗を内部で警告として吸収し、例外を
    // 投げない設計（docs/design/data-sync-design.md §5 Phase 5）。
    // 同期本体（DB取り込み）は既に成功しているため、statusは変更しない。
    const collectMetricsResult = await runCollectMetricsPhase(db, {
      runner: options.commandRunner,
      gcloudConfig: fetchOptions.config,
      collectMetricsConfig,
    });
    collectorVersionSeen = collectMetricsResult.collectorVersionSeen;
    if (collectMetricsResult.warnings.length > 0) {
      errorMessage = collectMetricsResult.warnings.join(" / ");
      logHuman(
        `[sync] collect-metricsで警告がありました（同期自体は継続）: ${errorMessage}`,
      );
    }

    phaseReached = "cleanup";
  } catch (err) {
    status = "failed";
    errorMessage = err instanceof Error ? err.message : String(err);

    if (err instanceof ValidateError) {
      integrityOk = err.integrityOk;
      schemaOk = err.schemaOk;
    }
  } finally {
    // cleanupは成否によらず必ず実行する（phase_reachedは失敗が発生した
    // フェーズを記録するため、ここでは上書きしない）
    const rawCopyDeleted = runCleanupPhase({
      localRawDbPath: fetchOptions.localRawDbPath,
      localRawWalPath: fetchOptions.localRawWalPath,
    });

    finishSyncHistory(db, historyId, {
      status,
      phaseReached,
      integrityOk,
      schemaOk,
      rowsIngested,
      collectorVersionSeen,
      errorMessage,
      rawCopyDeleted,
    });
    db.close();

    emitResult(status, { error: errorMessage, rowsIngested });
  }

  return { status, phaseReached, errorMessage, rowsIngested };
}

export type { GcloudSyncConfig };
