/**
 * Phase 5: collect-metrics — マシン負荷スポット収集・OOM/CPU/cronファイル回収。
 *
 * docs/design/data-sync-design.md §5 Phase 5 / docs/requirements.md §5 準拠。
 *
 * 実行する4項目:
 * 1. スポット収集（方式B）: `/proc/meminfo`・`/proc/loadavg`・`docker stats --no-stream`・
 *    DBファイルサイズ・ルートFS空きを1コマンドで取得 → machine_metrics(source='spot') /
 *    container_stats(source='spot') へUPSERT
 * 2. OOMログ回収: 永続ログ（journalctl -k / kern.log）からOOM記録を取得 → oom_events へUPSERT
 * 3. cronファイル回収（方式D）: collector出力ファイルをscpで取得できれば取り込む
 *    （**ファイルが無ければスキップ=正常**。設置は別タスク「aqh」の担当のため、
 *    本タスクの時点では未設置が通常状態）
 * 4. GCP Monitoring CPU回収（方式C）: `gcloud auth print-access-token` でトークンを取得後、
 *    Cloud Monitoring REST API（`timeSeries.list`）をfetchで呼び出して取得 →
 *    cpu_metrics へUPSERT
 *
 * **失敗ポリシー（docs/design/data-sync-design.md §5 Phase 5 準拠）**:
 * 4項目のいずれが失敗しても、このフェーズは例外を投げない。個別の失敗は
 * `warnings` として収集し、呼び出し側（runner.ts）が `sync_history.error_message` に
 * 記録する。同期全体のstatusは（他フェーズが成功していれば）`success` のまま。
 */

import fs from "fs";

import type Database from "better-sqlite3";

import type { CommandRunner } from "../commandRunner";
import {
  buildOomLogCommand,
  buildScpCollectorFileCommand,
  buildSpotMetricsCommand,
} from "../collectMetricsCommands";
import {
  parseCollectorJsonl,
  parseOomLogOutput,
  parseSpotOutput,
} from "../collectMetricsParsers";
import {
  upsertContainerStats,
  upsertCpuMetrics,
  upsertMachineMetric,
  upsertOomEvents,
} from "../collectMetricsUpsert";
import type { CollectMetricsConfig, GcloudSyncConfig } from "../config";
import { fetchCpuMetricsViaRestApi, type FetchLike } from "../cpuMetricsFetcher";
import { emitPhaseDone, emitPhaseProgress, emitPhaseStart } from "../progress";

/** collect-metricsフェーズの実行オプション。 */
export interface CollectMetricsPhaseOptions {
  runner: CommandRunner;
  gcloudConfig: GcloudSyncConfig;
  collectMetricsConfig: CollectMetricsConfig;
  /**
   * 方式C（Cloud Monitoring REST API呼び出し）に使う`fetch`互換関数。
   * テストで実HTTPを叩かないよう注入可能にしている。省略時は `globalThis.fetch`。
   */
  fetchFn?: FetchLike;
}

/** collect-metricsフェーズの結果。フェーズ自体は例外を投げない。 */
export interface CollectMetricsResult {
  /** 個別ステップの失敗メッセージ一覧（`sync_history.error_message` に連結して記録）。 */
  warnings: string[];
  /** 回収したcronファイルに含まれていたcollectorバージョン（複数あれば最後の行のもの）。 */
  collectorVersionSeen?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * 1. スポット収集（方式B）を実行し、machine_metrics/container_statsへUPSERTする。
 * 失敗時は例外を投げず `warnings` へ追記する。
 */
async function collectSpotMetrics(
  db: Database.Database,
  options: CollectMetricsPhaseOptions,
  warnings: string[],
): Promise<void> {
  try {
    const plan = buildSpotMetricsCommand(options.gcloudConfig);
    const result = await options.runner.run(plan.command, plan.args);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || "unknown error");
    }

    const parsed = parseSpotOutput(result.stdout);
    const tsUtc = nowIso();

    upsertMachineMetric(db, {
      tsUtc,
      source: "spot",
      memTotalKb: parsed.meminfo.memTotalKb,
      memAvailableKb: parsed.meminfo.memAvailableKb,
      memFreeKb: parsed.meminfo.memFreeKb,
      swapTotalKb: parsed.meminfo.swapTotalKb,
      swapFreeKb: parsed.meminfo.swapFreeKb,
      loadavg1: parsed.loadavg.loadavg1,
      loadavg5: parsed.loadavg.loadavg5,
      loadavg15: parsed.loadavg.loadavg15,
      dbSizeBytes: parsed.dbSizeBytes,
      walSizeBytes: parsed.walSizeBytes,
      rootfsAvailBytes: parsed.rootfsAvailBytes,
      collectorVersion: null,
    });

    upsertContainerStats(
      db,
      parsed.containers.map((c) => ({
        tsUtc,
        source: "spot",
        containerName: c.name,
        cpuPct: c.cpuPct,
        memUsageBytes: c.memUsageBytes,
        memLimitBytes: c.memLimitBytes,
      })),
    );

    emitPhaseProgress(
      "collect-metrics",
      `スポット収集完了: コンテナ${parsed.containers.length}件`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`スポット収集に失敗しました: ${message}`);
    emitPhaseProgress("collect-metrics", `スポット収集に失敗しました: ${message}`);
  }
}

/**
 * 2. OOMログ回収を実行し、oom_eventsへUPSERTする。
 * 失敗時は例外を投げず `warnings` へ追記する。
 */
async function collectOomEvents(
  db: Database.Database,
  options: CollectMetricsPhaseOptions,
  warnings: string[],
): Promise<void> {
  try {
    const plan = buildOomLogCommand(options.gcloudConfig);
    const result = await options.runner.run(plan.command, plan.args);
    if (result.exitCode !== 0) {
      throw new Error(result.stderr || result.stdout || "unknown error");
    }

    const events = parseOomLogOutput(result.stdout);
    const discoveredAt = nowIso();

    // killed_processが特定できないイベントは UNIQUE(occurred_at_utc, killed_process) の
    // 重複防止が機能しない（SQLiteはNULL同士を別値として扱う）ため取り込まない
    // （独自判断: 再回収のたびに重複行が増えるのを避ける）。
    const identifiable = events.filter(
      (e): e is typeof e & { killedProcess: string } => e.killedProcess !== null,
    );

    upsertOomEvents(
      db,
      identifiable.map((e) => ({
        occurredAtUtc: e.occurredAtUtc,
        killedProcess: e.killedProcess,
        source: e.source,
        rawLine: e.rawLine,
        discoveredAt,
      })),
    );

    emitPhaseProgress(
      "collect-metrics",
      `OOMログ回収完了: ${identifiable.length}件（プロセス名不明のため除外: ${events.length - identifiable.length}件）`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`OOMログ回収に失敗しました: ${message}`);
    emitPhaseProgress("collect-metrics", `OOMログ回収に失敗しました: ${message}`);
  }
}

/**
 * 3. cronファイル回収（方式D）を実行し、machine_metrics(source='cron')/
 * container_stats(source='cron')へUPSERTする。ファイルが存在しない場合は
 * スキップ（正常）として扱い、warningsには追加しない。
 *
 * @returns 検出したcollectorバージョン（最後の行のもの。取得できなければundefined）
 */
async function collectCronFile(
  db: Database.Database,
  options: CollectMetricsPhaseOptions,
  warnings: string[],
): Promise<string | undefined> {
  const { localCollectorTmpPath, remoteCollectorFilePath, expectedCollectorVersion } =
    options.collectMetricsConfig;

  try {
    if (fs.existsSync(localCollectorTmpPath)) {
      fs.rmSync(localCollectorTmpPath);
    }

    const plan = buildScpCollectorFileCommand(
      options.gcloudConfig,
      remoteCollectorFilePath,
      localCollectorTmpPath,
    );
    const result = await options.runner.run(plan.command, plan.args);

    if (result.exitCode !== 0 || !fs.existsSync(localCollectorTmpPath)) {
      // 未設置（別タスク「aqh」担当）または一時的な取得失敗はスキップ扱い（正常）。
      emitPhaseProgress(
        "collect-metrics",
        "collector出力ファイルが見つからないためスキップしました（未設置の可能性）",
      );
      return undefined;
    }

    const text = fs.readFileSync(localCollectorTmpPath, "utf-8");
    const { samples, skippedLines } = parseCollectorJsonl(text);

    for (const sample of samples) {
      upsertMachineMetric(db, {
        tsUtc: sample.ts,
        source: "cron",
        memTotalKb: sample.mem.total_kb,
        memAvailableKb: sample.mem.available_kb,
        memFreeKb: sample.mem.free_kb,
        swapTotalKb: sample.swap.total_kb,
        swapFreeKb: sample.swap.free_kb,
        loadavg1: sample.load[0],
        loadavg5: sample.load[1],
        loadavg15: sample.load[2],
        dbSizeBytes: sample.db.sqlite_bytes,
        walSizeBytes: sample.db.wal_bytes,
        rootfsAvailBytes: sample.rootfs_avail_bytes,
        collectorVersion: sample.v,
      });

      upsertContainerStats(
        db,
        sample.containers.map((c) => ({
          tsUtc: sample.ts,
          source: "cron",
          containerName: c.name,
          cpuPct: c.cpu_pct,
          memUsageBytes: c.mem_bytes,
          memLimitBytes: c.mem_limit_bytes,
        })),
      );
    }

    const collectorVersionSeen =
      samples.length > 0 ? samples[samples.length - 1].v : undefined;

    if (collectorVersionSeen && collectorVersionSeen !== expectedCollectorVersion) {
      warnings.push(
        `collectorのバージョン不一致を検知しました（想定: ${expectedCollectorVersion} / 検出: ${collectorVersionSeen}）。deploy-collectorでの更新を検討してください`,
      );
    }

    emitPhaseProgress(
      "collect-metrics",
      `cronファイル回収完了: ${samples.length}件取り込み（壊れた行のスキップ: ${skippedLines}件）`,
    );

    return collectorVersionSeen;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`cronファイル回収に失敗しました: ${message}`);
    emitPhaseProgress("collect-metrics", `cronファイル回収に失敗しました: ${message}`);
    return undefined;
  } finally {
    // credentials等の機微情報は含まないが、一時ファイルを残さない衛生を優先する。
    if (fs.existsSync(localCollectorTmpPath)) {
      fs.rmSync(localCollectorTmpPath, { force: true });
    }
  }
}

/**
 * 4. GCP Monitoring CPU回収（方式C）を実行し、cpu_metricsへUPSERTする。
 * 開始時刻は既存の `cpu_metrics` の最新時刻の直後、無ければ
 * `cpuMetricsLookbackDays` 遡った時刻とする。失敗時は例外を投げず `warnings` へ追記する。
 *
 * アクセストークン取得（gcloud）とREST API呼び出し（fetch）は
 * `cpuMetricsFetcher.ts` に委譲する（テストではCommandRunner/fetchの両方をモックする）。
 */
async function collectCpuMetrics(
  db: Database.Database,
  options: CollectMetricsPhaseOptions,
  warnings: string[],
): Promise<void> {
  try {
    const latestRow = db
      .prepare("SELECT MAX(ts_utc) AS latest FROM cpu_metrics")
      .get() as { latest: string | null };

    const endTime = new Date();
    const startTime = latestRow.latest
      ? new Date(latestRow.latest)
      : new Date(
          endTime.getTime() -
            options.collectMetricsConfig.cpuMetricsLookbackDays * 24 * 60 * 60 * 1000,
        );

    if (startTime.getTime() >= endTime.getTime()) {
      emitPhaseProgress(
        "collect-metrics",
        "CPU使用率は既に最新のため取得をスキップしました",
      );
      return;
    }

    const points = await fetchCpuMetricsViaRestApi({
      runner: options.runner,
      gcloudConfig: options.gcloudConfig,
      intervalStartTimeIso: startTime.toISOString(),
      intervalEndTimeIso: endTime.toISOString(),
      fetchFn: options.fetchFn,
    });

    upsertCpuMetrics(
      db,
      points.map((p) => ({ tsUtc: p.tsUtc, cpuUtil: p.cpuUtil })),
    );

    emitPhaseProgress(
      "collect-metrics",
      `CPU使用率(GCP Monitoring)回収完了: ${points.length}件`,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`CPU使用率(GCP Monitoring)の回収に失敗しました: ${message}`);
    emitPhaseProgress(
      "collect-metrics",
      `CPU使用率(GCP Monitoring)の回収に失敗しました: ${message}`,
    );
  }
}

/**
 * collect-metricsフェーズを実行する。
 *
 * どの項目が失敗してもこの関数自体は例外を投げない
 * （docs/design/data-sync-design.md §5 Phase 5: メトリクス回収の失敗は
 * 同期全体を失敗させない）。呼び出し側（runner.ts）は返り値の `warnings` を
 * `sync_history.error_message` に記録し、`status` は変更しない。
 */
export async function runCollectMetricsPhase(
  db: Database.Database,
  options: CollectMetricsPhaseOptions,
): Promise<CollectMetricsResult> {
  emitPhaseStart("collect-metrics");

  const warnings: string[] = [];

  await collectSpotMetrics(db, options, warnings);
  await collectOomEvents(db, options, warnings);
  const collectorVersionSeen = await collectCronFile(db, options, warnings);
  await collectCpuMetrics(db, options, warnings);

  emitPhaseDone("collect-metrics");

  return { warnings, collectorVersionSeen };
}
