/**
 * Phase 2: validate — 生コピーの整合性検証・スキーマ検証。
 *
 * docs/design/data-sync-design.md §5 Phase 2 / docs/design/db-design.md §3.1 準拠。
 *
 * 1. `PRAGMA quick_check` による整合性検証（稼働中DBのコピーはまれに不整合）
 * 2. 取り込み対象5テーブルのスキーマ検証（`src/shared/schemas` の期待カラムが
 *    実カラムの部分集合であること。`schemaExpectations.ts` 参照）
 *
 * どちらかが失敗した場合は取り込みを中断する（黙って壊れたデータを蓄積しない）。
 */

import Database from "better-sqlite3";

import { N8N_SOURCE_TABLE_EXPECTATIONS } from "../schemaExpectations";
import {
  emitPhaseDone,
  emitPhaseError,
  emitPhaseProgress,
  emitPhaseStart,
  logHuman,
} from "../progress";
import { ValidateError } from "../errors";

/** validateフェーズの検証結果。 */
export interface ValidateResult {
  integrityOk: boolean;
  schemaOk: boolean;
  /** 検証エラーの詳細メッセージ一覧（integrityOk/schemaOkがfalseのとき非空）。 */
  errors: string[];
}

/**
 * `PRAGMA quick_check` を実行し、結果が `ok` の1行のみであれば整合とみなす。
 */
function runQuickCheck(db: Database.Database): boolean {
  const rows = db.pragma("quick_check") as Array<Record<string, string>>;
  if (rows.length !== 1) {
    return false;
  }
  const value = Object.values(rows[0])[0];
  return value === "ok";
}

/**
 * 取り込み対象5テーブルについて、想定カラムが実カラムの部分集合であるかを検証する。
 * テーブルが存在しない場合もエラーとする。
 */
function checkTableSchemas(db: Database.Database): string[] {
  const errors: string[] = [];

  for (const expectation of N8N_SOURCE_TABLE_EXPECTATIONS) {
    const columns = db.pragma(
      `table_info(${expectation.tableName})`,
    ) as Array<{ name: string }>;

    if (columns.length === 0) {
      errors.push(`テーブル "${expectation.tableName}" が見つかりません`);
      continue;
    }

    const actualNames = new Set(columns.map((c) => c.name));
    const missing = expectation.expectedColumns.filter(
      (c) => !actualNames.has(c),
    );

    if (missing.length > 0) {
      errors.push(
        `テーブル "${expectation.tableName}" に想定カラムが不足しています: ${missing.join(", ")}`,
      );
    }
  }

  return errors;
}

/**
 * validateフェーズを実行する。
 *
 * @param rawDbPath 生コピー（database.sqlite）のローカルパス
 * @returns 検証結果。`integrityOk`/`schemaOk` のいずれかが false の場合は
 *          {@link ValidateError} をスローする（呼び出し側は結果を
 *          `sync_history` へ記録したうえで中断すること）
 */
export function runValidatePhase(rawDbPath: string): ValidateResult {
  emitPhaseStart("validate");

  let db: Database.Database | undefined;
  try {
    try {
      db = new Database(rawDbPath, { readonly: true, fileMustExist: true });
    } catch (err) {
      // ファイルが有効なSQLiteでない等、openの時点で失敗するケース
      const message = `DBファイルを開けませんでした（破損の可能性があります）: ${
        err instanceof Error ? err.message : String(err)
      }`;
      emitPhaseError("validate", message);
      throw new ValidateError(message, { integrityOk: false, schemaOk: false });
    }

    emitPhaseProgress("validate", "PRAGMA quick_check を実行中");
    let integrityOk: boolean;
    try {
      integrityOk = runQuickCheck(db);
    } catch (err) {
      // 深刻な破損の場合、better-sqlite3自体が例外を投げることがある
      integrityOk = false;
      logHuman(
        `[sync] quick_check実行時に例外が発生しました（不整合として扱います）: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }

    if (!integrityOk) {
      const message =
        "PRAGMA quick_check に失敗しました（DBファイルの不整合の可能性があります。再取得してください）";
      emitPhaseError("validate", message);
      throw new ValidateError(message, { integrityOk: false, schemaOk: false });
    }

    emitPhaseProgress("validate", "取り込み対象テーブルのスキーマを検証中");
    const schemaErrors = checkTableSchemas(db);
    const schemaOk = schemaErrors.length === 0;

    if (!schemaOk) {
      const message = `スキーマ検証に失敗しました: ${schemaErrors.join(" / ")}`;
      emitPhaseError("validate", message);
      throw new ValidateError(message, { integrityOk: true, schemaOk: false });
    }

    emitPhaseDone("validate");
    return { integrityOk: true, schemaOk: true, errors: [] };
  } finally {
    db?.close();
  }
}
