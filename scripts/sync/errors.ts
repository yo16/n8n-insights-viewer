/**
 * 同期CLI各フェーズで使う専用エラークラス群。
 *
 * `runner.ts` はこれらのエラーをキャッチし、`sync_history.phase_reached` /
 * `error_message` に記録する（docs/design/data-sync-design.md §5）。
 */

/** Phase 1: fetch（DBコピー取得）失敗時のエラー。 */
export class FetchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FetchError";
  }
}

/** Phase 2: validate（整合性/スキーマ検証）失敗時のエラー。 */
export class ValidateError extends Error {
  /** `PRAGMA quick_check` の結果（0/1）。sync_history.integrity_ok に記録する。 */
  public readonly integrityOk: boolean;
  /** スキーマ検証の結果（0/1）。sync_history.schema_ok に記録する。 */
  public readonly schemaOk: boolean;

  constructor(
    message: string,
    flags: { integrityOk: boolean; schemaOk: boolean },
  ) {
    super(message);
    this.name = "ValidateError";
    this.integrityOk = flags.integrityOk;
    this.schemaOk = flags.schemaOk;
  }
}

/**
 * Phase 3: extract（生コピーからのホワイトリスト抽出・zod検証）失敗時のエラー。
 *
 * 生コピーを開けない場合や、取り込み対象5テーブルの行がzodスキーマの検証に
 * 失敗した場合に投げる（docs/design/data-sync-design.md §5 Phase 3）。
 * 検証エラー時は取り込みを中断する（黙って壊れたデータを蓄積しない）。
 */
export class ExtractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExtractError";
  }
}

/** Phase 4: ingest（蓄積DBへの取り込み）失敗時のエラー。 */
export class IngestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IngestError";
  }
}
