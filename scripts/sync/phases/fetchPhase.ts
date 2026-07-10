/**
 * Phase 1: fetch — 本番DBコピーの取得。
 *
 * docs/design/data-sync-design.md §5 Phase 1 準拠:
 * 1. リモートスナップショット（サーバー側/tmpへ `sudo cp`）
 * 2. `gcloud compute scp` でローカル `data/raw/` へ取得
 * 3. サーバー側/tmpのコピーを削除（成否によらず必ず試みる）
 *
 * コマンドの組み立ては `gcloudCommands.ts`、実行は `CommandRunner` に委譲する
 * （本ファイルは実行順序の制御・進捗出力・失敗判定に専念する）。
 *
 * docs/design/security-design.md §3 の「異常終了時のリカバリ」に従い、
 * 開始前に前回の生コピーが残っていれば削除してから開始する。
 */

import fs from "fs";

import type { CommandRunner } from "../commandRunner";
import {
  LOCAL_RAW_DB_PATH,
  LOCAL_RAW_DIR,
  LOCAL_RAW_WAL_PATH,
  getDefaultGcloudSyncConfig,
  type GcloudSyncConfig,
} from "../config";
import { FetchError } from "../errors";
import { buildFetchCommandPlan } from "../gcloudCommands";
import {
  emitPhaseDone,
  emitPhaseError,
  emitPhaseProgress,
  emitPhaseStart,
} from "../progress";

/** fetchフェーズの実行パラメータ（テスト時にパスを差し替え可能にするための注入）。 */
export interface FetchPhaseOptions {
  config: GcloudSyncConfig;
  localRawDir: string;
  localRawDbPath: string;
  localRawWalPath: string;
}

/** CLI実行時に使う既定のfetchフェーズ設定。 */
export function defaultFetchPhaseOptions(): FetchPhaseOptions {
  return {
    config: getDefaultGcloudSyncConfig(),
    localRawDir: LOCAL_RAW_DIR,
    localRawDbPath: LOCAL_RAW_DB_PATH,
    localRawWalPath: LOCAL_RAW_WAL_PATH,
  };
}

/**
 * 前回同期が異常終了した場合に残りうる生コピーを削除してから、
 * ローカルの生コピー保存先ディレクトリを用意する。
 */
export function removeExistingRawCopies(options: FetchPhaseOptions): void {
  fs.mkdirSync(options.localRawDir, { recursive: true });
  for (const filePath of [options.localRawDbPath, options.localRawWalPath]) {
    if (fs.existsSync(filePath)) {
      fs.rmSync(filePath);
    }
  }
}

/**
 * fetchフェーズを実行する。
 *
 * @param runner  コマンド実行層（実運用では `GcloudCommandRunner`、
 *                テストではフェイク実装を注入する）
 * @param options fetchフェーズの設定・ローカルパス
 */
export async function runFetchPhase(
  runner: CommandRunner,
  options: FetchPhaseOptions = defaultFetchPhaseOptions(),
): Promise<void> {
  emitPhaseStart("fetch");

  removeExistingRawCopies(options);

  const plan = buildFetchCommandPlan(
    options.config,
    options.localRawDbPath,
    options.localRawWalPath,
  );

  try {
    emitPhaseProgress("fetch", plan.snapshot.description);
    const snapshotResult = await runner.run(
      plan.snapshot.command,
      plan.snapshot.args,
    );
    if (snapshotResult.exitCode !== 0) {
      throw new FetchError(
        `本番DBのスナップショット作成に失敗しました: ${snapshotResult.stderr || snapshotResult.stdout}`,
      );
    }

    emitPhaseProgress("fetch", plan.scpDb.description);
    const scpDbResult = await runner.run(plan.scpDb.command, plan.scpDb.args);
    if (scpDbResult.exitCode !== 0) {
      throw new FetchError(
        `database.sqlite の取得に失敗しました: ${scpDbResult.stderr || scpDbResult.stdout}`,
      );
    }

    emitPhaseProgress("fetch", plan.scpWal.description);
    const scpWalResult = await runner.run(
      plan.scpWal.command,
      plan.scpWal.args,
    );
    if (scpWalResult.exitCode !== 0) {
      // -walファイルは存在しない場合がありうるため、取得失敗自体は致命的にしない
      emitPhaseProgress(
        "fetch",
        "-wal ファイルの取得をスキップしました（存在しない可能性があります）",
      );
    }

    if (!fs.existsSync(options.localRawDbPath)) {
      throw new FetchError(
        "database.sqlite の取得に失敗しました（ローカルにファイルが存在しません）",
      );
    }

    emitPhaseDone("fetch");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    emitPhaseError("fetch", message);
    throw err;
  } finally {
    // サーバー側/tmpの後始末は、成否によらず必ず試みる
    // （security-design.md §3: 生コピー削除の保証）
    const cleanupResult = await runner
      .run(plan.cleanupRemoteTmp.command, plan.cleanupRemoteTmp.args)
      .catch((err: unknown) => ({
        stdout: "",
        stderr: err instanceof Error ? err.message : String(err),
        exitCode: 1,
      }));

    if (cleanupResult.exitCode !== 0) {
      emitPhaseProgress(
        "fetch",
        `サーバー側/tmpの削除に失敗しました。手動確認を推奨します: ${cleanupResult.stderr}`,
      );
    } else {
      emitPhaseProgress("fetch", "サーバー側/tmpの一時コピーを削除しました");
    }
  }
}
