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
 * 未実装フェーズ（extract/ingest/collect-metrics）に到達した際のエラー。
 * 後続タスク（shu）で実装が追加されるまでの骨格として使う。
 */
export class NotImplementedPhaseError extends Error {
  constructor(public readonly phase: string) {
    super(
      `[sync] フェーズ "${phase}" は未実装です（後続タスクで実装されます。docs/design/data-sync-design.md 参照）`,
    );
    this.name = "NotImplementedPhaseError";
  }
}
