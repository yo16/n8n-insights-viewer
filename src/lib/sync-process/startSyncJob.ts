import "server-only";

import { randomUUID } from "crypto";
import { spawn } from "child_process";

import { parseProgressLines } from "./parseProgressLines";
import {
  getCurrentJob,
  isJobRunning,
  publishSyncJobUpdate,
  setCurrentChild,
  setCurrentJob,
} from "./store";
import type { SyncJob } from "./types";

/**
 * 同期CLIを子プロセスとして起動するモジュール。
 *
 * `docs/design/api-design.md` §3.1 準拠:
 * - `npm run sync` を `spawn` で起動する。**Windowsのため `shell: true`** を必ず指定する
 * - 二重起動防止: 実行中ジョブがあれば起動せず、既存ジョブを返す
 *   （呼び出し側の Route Handler が 409 を返す判断材料にする）
 * - stdoutをJSON Lines単位でパースしジョブの `events` に蓄積、購読者へ配信する
 * - プロセス終了時、`__result__` イベントがあればそのstatusを、無ければ終了コードから
 *   状態を判定してジョブを終了状態にする
 */

/** `startSyncJob` の起動オプション（テストで実コマンドの代わりにダミーを注入するために存在）。 */
export interface StartSyncJobOptions {
  /** 起動するコマンド。既定値: `npm`。 */
  command?: string;
  /** コマンド引数。既定値: `["run", "sync"]`。 */
  args?: string[];
  /** 作業ディレクトリ。既定値: `process.cwd()`。 */
  cwd?: string;
}

export interface StartSyncJobResult {
  job: SyncJob;
  /** 既に実行中ジョブがあり、新規起動しなかった場合 `true`。 */
  alreadyRunning: boolean;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * 同期CLIを起動する。既に実行中のジョブがある場合は起動せず、
 * `alreadyRunning: true` とともに既存のジョブを返す。
 */
export function startSyncJob(
  options: StartSyncJobOptions = {},
): StartSyncJobResult {
  if (isJobRunning()) {
    const existing = getCurrentJob();
    // isJobRunning() が true の時点で existing は必ず存在する
    return { job: existing as SyncJob, alreadyRunning: true };
  }

  const command = options.command ?? "npm";
  const args = options.args ?? ["run", "sync"];
  const cwd = options.cwd ?? process.cwd();

  const job: SyncJob = {
    id: randomUUID(),
    status: "running",
    startedAt: nowIso(),
    events: [],
  };
  setCurrentJob(job);

  const child = spawn(command, args, { shell: true, cwd });
  setCurrentChild(child);

  let stdoutBuffer = "";

  child.stdout?.on("data", (chunk: Buffer) => {
    const { events, remainder } = parseProgressLines(
      stdoutBuffer,
      chunk.toString("utf-8"),
    );
    stdoutBuffer = remainder;

    for (const event of events) {
      job.events.push(event);
      publishSyncJobUpdate({ type: "progress", event });
    }
  });

  child.on("error", (err) => {
    finishJob(job, {
      status: "failed",
      exitCode: null,
      error: err.message,
    });
  });

  child.on("close", (exitCode) => {
    if (job.status !== "running") {
      // "error" イベントで既に終了処理済み
      return;
    }

    const lastResult = [...job.events]
      .reverse()
      .find((event) => event.phase === "__result__");

    if (lastResult && lastResult.phase === "__result__") {
      finishJob(job, {
        status: lastResult.status === "success" ? "success" : "failed",
        exitCode,
        error: lastResult.error,
      });
      return;
    }

    finishJob(job, {
      status: exitCode === 0 ? "success" : "failed",
      exitCode,
      error:
        exitCode === 0
          ? undefined
          : `同期プロセスが異常終了しました (exit code: ${String(exitCode)})`,
    });
  });

  return { job, alreadyRunning: false };
}

function finishJob(
  job: SyncJob,
  result: {
    status: "success" | "failed" | "aborted";
    exitCode: number | null;
    error?: string;
  },
): void {
  job.status = result.status;
  job.finishedAt = nowIso();
  job.exitCode = result.exitCode;
  job.error = result.error;
  setCurrentChild(undefined);
  publishSyncJobUpdate({ type: "finished", job });
}
