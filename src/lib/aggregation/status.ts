import "server-only";

import type { Thresholds } from "../config/thresholds";
import type { MachineMetricsRow } from "../db/queries/machine";

/**
 * 状態評価ロジック（api-design.md §4.3 / 要件 §6.3）。
 *
 * 最新の machine_metrics と thresholds設定から「正常/注意/危険」を判定する。
 * 各指標を閾値と比較し、最も重いレベルを全体状態とする。判定根拠（どの指標が
 * どの閾値を超えたか）を `reasons` に併記する。
 *
 * - MemAvailable: 値が小さいほど悪化（`< warning` で注意、`< danger` で危険）
 * - スワップ使用量: 値が大きいほど悪化（`> warning` で注意、`> danger` で危険）
 * - database.sqlite + WAL サイズ: 値が大きいほど悪化（`> warning` で注意。危険閾値は設定なし）
 *
 * 本来の設計（api-design.md §4.3）では判定の純粋関数は `src/shared/status/evaluate.ts` に
 * 置く想定だが、本タスクの担当領域が `src/lib/aggregation/**` に限定されているため、
 * 集計層内に閉じたモジュールとして実装する（設定は引数で受け取る純粋関数である点は変わらない）。
 */

export type StatusLevel = "normal" | "warning" | "danger";

export interface StatusEvaluationInput {
  /** 直近のMemAvailable（KB）。取得できない場合は null */
  memAvailableKb: number | null;
  /** 直近のスワップ使用量（KB, = swap_total_kb - swap_free_kb）。取得できない場合は null */
  swapUsedKb: number | null;
  /** 直近のDBサイズ（bytes, = db_size_bytes + wal_size_bytes）。取得できない場合は null */
  dbSizeBytes: number | null;
}

export interface StatusResult {
  level: StatusLevel;
  /** 判定根拠（どの指標がどの閾値を超えたか）。normalの場合は空配列 */
  reasons: string[];
}

const LEVEL_ORDER: Record<StatusLevel, number> = { normal: 0, warning: 1, danger: 2 };

function escalate(current: StatusLevel, candidate: StatusLevel): StatusLevel {
  return LEVEL_ORDER[candidate] > LEVEL_ORDER[current] ? candidate : current;
}

/**
 * machine_metrics の1行から状態評価の入力を組み立てる。
 * 行が無い（データ未収集）場合はすべて null（判定材料なし）を返す。
 */
export function buildStatusInputFromMachineMetrics(
  row: MachineMetricsRow | undefined,
): StatusEvaluationInput {
  if (!row) {
    return { memAvailableKb: null, swapUsedKb: null, dbSizeBytes: null };
  }

  const swapUsedKb =
    row.swap_total_kb !== null && row.swap_free_kb !== null
      ? row.swap_total_kb - row.swap_free_kb
      : null;

  const dbSizeBytes =
    row.db_size_bytes !== null ? row.db_size_bytes + (row.wal_size_bytes ?? 0) : null;

  return {
    memAvailableKb: row.mem_available_kb,
    swapUsedKb,
    dbSizeBytes,
  };
}

/**
 * 状態評価: 各指標を閾値と比較し、最も重いレベルを全体状態として返す。
 * 値が null の指標は判定対象から除外する（データ未収集で正常扱いにはしない、
 * 単に「その指標からは判定できない」ことを意味する）。
 */
export function evaluateStatus(
  input: StatusEvaluationInput,
  thresholds: Thresholds,
): StatusResult {
  let level: StatusLevel = "normal";
  const reasons: string[] = [];

  if (input.memAvailableKb !== null) {
    const v = input.memAvailableKb;
    if (v < thresholds.memAvailableKb.danger) {
      reasons.push(
        `MemAvailable ${v}KB が危険閾値 ${thresholds.memAvailableKb.danger}KB を下回っています`,
      );
      level = escalate(level, "danger");
    } else if (v < thresholds.memAvailableKb.warning) {
      reasons.push(
        `MemAvailable ${v}KB が注意閾値 ${thresholds.memAvailableKb.warning}KB を下回っています`,
      );
      level = escalate(level, "warning");
    }
  }

  if (input.swapUsedKb !== null) {
    const v = input.swapUsedKb;
    if (v > thresholds.swapUsedKb.danger) {
      reasons.push(
        `スワップ使用量 ${v}KB が危険閾値 ${thresholds.swapUsedKb.danger}KB を超えています`,
      );
      level = escalate(level, "danger");
    } else if (v > thresholds.swapUsedKb.warning) {
      reasons.push(
        `スワップ使用量 ${v}KB が注意閾値 ${thresholds.swapUsedKb.warning}KB を超えています`,
      );
      level = escalate(level, "warning");
    }
  }

  if (input.dbSizeBytes !== null) {
    const v = input.dbSizeBytes;
    if (v > thresholds.dbSizeBytes.warning) {
      reasons.push(
        `DBサイズ ${v}bytes が注意閾値 ${thresholds.dbSizeBytes.warning}bytes を超えています`,
      );
      level = escalate(level, "warning");
    }
  }

  return { level, reasons };
}
