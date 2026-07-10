/**
 * 同期CLIのフェーズランナー。
 *
 * docs/design/data-sync-design.md §2 の6フェーズ
 * （fetch→validate→extract→ingest→collect-metrics→cleanup）を順次実行し、
 * `sync_history` へ記録する。
 *
 * - extract/ingestはBeadsタスク「shu」で実装済み
 * - collect-metricsは未実装のため、到達した時点で明示的にエラー終了する
 *   骨格のみを用意する（後続タスク「8k8」で実装予定）
 * - cleanupは、どのフェーズで失敗しても必ず実行する（try/finally相当。
 *   docs/design/security-design.md §3）
 */

import { NotImplementedPhaseError, ValidateError } from "./errors";
import type { CommandRunner } from "./commandRunner";
import {
  LOCAL_ACCUMULATION_DB_PATH,
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
import { runNotImplementedPhase } from "./phases/notImplementedPhase";
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
 * fetch/validate/extract/ingestを実装済みフェーズとして実行し、
 * collect-metricsフェーズで明示的に停止する（後続タスクで実装が
 * 追加されるまでの骨格）。cleanupはどの段階で失敗しても必ず実行する。
 */
export async function runSync(options: RunSyncOptions): Promise<SyncRunResult> {
  const fetchOptions = options.fetchOptions ?? defaultFetchPhaseOptions();
  const accumulationDbPath =
    options.accumulationDbPath ?? LOCAL_ACCUMULATION_DB_PATH;

  const db = openAccumulationDbForWrite(accumulationDbPath);
  const historyId = startSyncHistory(db);

  let phaseReached: SyncPhase = "fetch";
  let integrityOk: boolean | undefined;
  let schemaOk: boolean | undefined;
  let errorMessage: string | undefined;
  let rowsIngested: Record<string, number> | undefined;
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
    runNotImplementedPhase("collect-metrics");
  } catch (err) {
    status = "failed";
    errorMessage = err instanceof Error ? err.message : String(err);

    if (err instanceof ValidateError) {
      integrityOk = err.integrityOk;
      schemaOk = err.schemaOk;
    }
    if (err instanceof NotImplementedPhaseError) {
      logHuman(
        `[sync] フェーズ "${err.phase}" は未実装のため同期を中断しました`,
      );
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
      errorMessage,
      rawCopyDeleted,
    });
    db.close();

    emitResult(status, { error: errorMessage, rowsIngested });
  }

  return { status, phaseReached, errorMessage, rowsIngested };
}

export type { GcloudSyncConfig };
