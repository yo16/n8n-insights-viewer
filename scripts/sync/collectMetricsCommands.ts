/**
 * collect-metricsフェーズ（Phase 5）で実行するコマンドの組み立て（純粋関数・実行は行わない）。
 *
 * docs/design/data-sync-design.md §5 Phase 5 / docs/requirements.md §5 準拠。
 *
 * **絶対厳守**: ここで組み立てるコマンドは読み取り専用のみ
 * （cat/stat/df/docker stats --no-stream/journalctl/scp取得）。
 * サーバーへの書き込み・cron変更・ファイル配置は一切含めない
 * （収集スクリプトの設置は別タスク「aqh」の担当）。
 *
 * 実行（子プロセス起動）は `commandRunner.ts` に委譲する。本ファイルは
 * コマンド・引数の組み立てにのみ専念し、単体テストで実gcloudを使わずに
 * 組み立て結果のみを検証できるようにする。
 */

import type { GcloudSyncConfig } from "./config";
import type { PlannedCommand } from "./gcloudCommands";

function projectZoneArgs(config: GcloudSyncConfig): string[] {
  return [`--project=${config.project}`, `--zone=${config.zone}`];
}

/**
 * 方式B（スポット収集）のリモートスクリプトを組み立てる。
 *
 * `===SECTION===` 形式のマーカーで区切って1コマンドの出力に全項目を含める
 * （docs/requirements.md §5.1: SSH取得は1コマンドにまとめる）。
 * 各行は `;` で連結し、一部のコマンドが失敗しても後続セクションの出力が
 * 欠落しないようにする（`&&` は使わない）。
 *
 * 使用コマンドはすべて読み取り専用: cat / docker stats --no-stream / stat / df。
 */
function buildRemoteSpotScript(config: GcloudSyncConfig): string {
  const dbPath = config.remoteDbPath;
  return [
    "echo '===MEMINFO==='",
    "cat /proc/meminfo",
    "echo '===LOADAVG==='",
    "cat /proc/loadavg",
    "echo '===DOCKERSTATS==='",
    "docker stats --no-stream --format '{{.Name}}\\t{{.CPUPerc}}\\t{{.MemUsage}}'",
    "echo '===DBSIZE==='",
    `stat -c%s '${dbPath}' 2>/dev/null || echo 0`,
    `stat -c%s '${dbPath}-wal' 2>/dev/null || echo 0`,
    "echo '===ROOTFS==='",
    "df -B1 --output=avail / | tail -n 1",
  ].join(" ; ");
}

/**
 * OOMイベント回収（永続ログ）のリモートスクリプトを組み立てる。
 *
 * `journalctl -k`（無ければ `/var/log/kern.log*`）から"Killed process"を含む
 * 行のみを抽出する。どちらの経路を通ったか判別できるよう、`sed` で
 * `journalctl|` / `kernlog|` の接頭辞を出力にのみ付与する
 * （元ログファイルは一切変更しない。読み取り専用のパイプ処理）。
 */
function buildRemoteOomLogScript(): string {
  return [
    "(journalctl -k --no-pager -o short-iso 2>/dev/null",
    "| grep -i 'killed process'",
    "| sed 's/^/journalctl|/')",
    "|| (cat /var/log/kern.log* 2>/dev/null",
    "| grep -i 'killed process'",
    "| sed 's/^/kernlog|/')",
    "|| true",
  ].join(" ");
}

/**
 * 方式B: スポット収集コマンド（1コマンドにまとめたSSH実行）。
 */
export function buildSpotMetricsCommand(
  config: GcloudSyncConfig,
): PlannedCommand {
  return {
    description: "スポット収集（メモリ/loadavg/docker stats/DBサイズ/ルートFS）",
    command: "gcloud",
    args: [
      "compute",
      "ssh",
      config.instance,
      ...projectZoneArgs(config),
      "--command",
      buildRemoteSpotScript(config),
    ],
  };
}

/**
 * OOMログ回収コマンド（永続ログのみを対象、dmesgは使わない）。
 */
export function buildOomLogCommand(config: GcloudSyncConfig): PlannedCommand {
  return {
    description: "永続ログ(journalctl -k / kern.log)からOOM記録を回収",
    command: "gcloud",
    args: [
      "compute",
      "ssh",
      config.instance,
      ...projectZoneArgs(config),
      "--command",
      buildRemoteOomLogScript(),
    ],
  };
}

/**
 * 方式D: cronファイル(metrics.jsonl)取得コマンド（scp）。
 * ファイルが存在しなければscpは失敗する（呼び出し側はこれを「未設置=正常」として扱う）。
 */
export function buildScpCollectorFileCommand(
  config: GcloudSyncConfig,
  remoteCollectorFilePath: string,
  localCollectorTmpPath: string,
): PlannedCommand {
  return {
    description: "collector出力ファイル(metrics.jsonl)を取得",
    command: "gcloud",
    args: [
      "compute",
      "scp",
      `${config.instance}:${remoteCollectorFilePath}`,
      localCollectorTmpPath,
      ...projectZoneArgs(config),
    ],
  };
}

/**
 * 方式C: GCP MonitoringからCPU使用率の時系列を取得するコマンド。
 *
 * `gcloud monitoring time-series list` を使用（読み取りのみ）。
 * インスタンス単体のみが対象のプロジェクトのため、zoneでの絞り込みのみを行う
 * （**独自判断**: instance_idの解決に追加のgcloud呼び出しが必要になり複雑化するため、
 * 対象プロジェクトに本インスタンス1台のみが存在する前提を利用して省略した）。
 */
export function buildCpuMetricsCommand(
  config: GcloudSyncConfig,
  intervalStartTimeIso: string,
  intervalEndTimeIso: string,
): PlannedCommand {
  const filter = `metric.type="compute.googleapis.com/instance/cpu/utilization" AND resource.labels.zone="${config.zone}"`;
  return {
    description: "GCP MonitoringからCPU使用率の時系列を取得",
    command: "gcloud",
    args: [
      "monitoring",
      "time-series",
      "list",
      `--project=${config.project}`,
      `--filter=${filter}`,
      `--interval-start-time=${intervalStartTimeIso}`,
      `--interval-end-time=${intervalEndTimeIso}`,
      "--format=json",
    ],
  };
}
