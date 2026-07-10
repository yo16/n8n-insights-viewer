import {
  evaluateStaleness,
  STALE_WARNING_DAYS,
} from "@/app/sync/_lib/staleness";
import type { SyncHistoryRow } from "@/lib/db/queries/sync";

/**
 * src/app/sync/_lib/staleness.ts の単体テスト。
 *
 * 重点: 「最終“成功”同期」から STALE_WARNING_DAYS（6日）超で isStale=true になる判定。
 * - 直近の履歴が失敗でも、それより前の成功履歴を基準にすること
 * - 成功実績が無ければ isStale=true（daysSinceLastSuccess=null）
 * - 境界値: ちょうど6日は isStale=false、6日+1msは isStale=true
 */

function makeRow(overrides: Partial<SyncHistoryRow>): SyncHistoryRow {
  return {
    id: 1,
    started_at: "2026-07-01T00:00:00.000Z",
    finished_at: "2026-07-01T00:10:00.000Z",
    status: "success",
    phase_reached: "cleanup",
    integrity_ok: 1,
    schema_ok: 1,
    rows_ingested_json: null,
    collector_version_seen: null,
    error_message: null,
    raw_copy_deleted: 1,
    ...overrides,
  };
}

describe("evaluateStaleness", () => {
  it("履歴が空の場合、成功実績なしとしてisStale=trueになる", () => {
    const result = evaluateStaleness([], "2026-07-10T00:00:00.000Z");

    expect(result.lastSuccess).toBeUndefined();
    expect(result.daysSinceLastSuccess).toBeNull();
    expect(result.isStale).toBe(true);
  });

  it("成功履歴が一件も無い場合（すべて失敗）、isStale=trueになる", () => {
    const history = [
      makeRow({ id: 3, status: "failed", finished_at: null }),
      makeRow({ id: 2, status: "failed", finished_at: "2026-07-05T00:00:00.000Z" }),
      makeRow({ id: 1, status: "aborted", finished_at: null }),
    ];

    const result = evaluateStaleness(history, "2026-07-10T00:00:00.000Z");

    expect(result.lastSuccess).toBeUndefined();
    expect(result.daysSinceLastSuccess).toBeNull();
    expect(result.isStale).toBe(true);
  });

  it("直近の履歴が失敗でも、それより前の成功履歴を基準に判定する", () => {
    // 新しい順（started_at DESC）を想定: 直近1件は失敗、その前が成功
    const history = [
      makeRow({
        id: 2,
        status: "failed",
        started_at: "2026-07-09T00:00:00.000Z",
        finished_at: null,
      }),
      makeRow({
        id: 1,
        status: "success",
        started_at: "2026-07-01T00:00:00.000Z",
        finished_at: "2026-07-01T00:00:00.000Z",
      }),
    ];

    const result = evaluateStaleness(history, "2026-07-08T00:00:00.000Z");

    expect(result.lastSuccess?.id).toBe(1);
    expect(result.daysSinceLastSuccess).toBe(7);
    expect(result.isStale).toBe(true);
  });

  it("成功していてもfinished_atが無い行はlastSuccess候補から除外される", () => {
    const history = [
      makeRow({ id: 2, status: "success", finished_at: null }),
      makeRow({
        id: 1,
        status: "success",
        finished_at: "2026-07-01T00:00:00.000Z",
      }),
    ];

    const result = evaluateStaleness(history, "2026-07-02T00:00:00.000Z");

    expect(result.lastSuccess?.id).toBe(1);
    expect(result.isStale).toBe(false);
  });

  it("境界値: ちょうど6日経過ではisStale=falseになる（6日超で警告のため）", () => {
    const history = [
      makeRow({ finished_at: "2026-07-01T00:00:00.000Z" }),
    ];

    const sixDaysLaterIso = "2026-07-07T00:00:00.000Z";

    const result = evaluateStaleness(history, sixDaysLaterIso);

    expect(result.daysSinceLastSuccess).toBe(STALE_WARNING_DAYS);
    expect(result.isStale).toBe(false);
  });

  it("境界値: 6日+1msの経過ではisStale=trueになる", () => {
    const history = [
      makeRow({ finished_at: "2026-07-01T00:00:00.000Z" }),
    ];

    const sixDaysAndOneMsLaterIso = "2026-07-07T00:00:00.001Z";

    const result = evaluateStaleness(history, sixDaysAndOneMsLaterIso);

    expect(result.daysSinceLastSuccess).toBeGreaterThan(STALE_WARNING_DAYS);
    expect(result.isStale).toBe(true);
  });

  it("経過日数が1日未満の場合、0以上1未満の小数を返しisStale=falseになる", () => {
    const history = [
      makeRow({ finished_at: "2026-07-01T00:00:00.000Z" }),
    ];

    const result = evaluateStaleness(history, "2026-07-01T12:00:00.000Z");

    expect(result.daysSinceLastSuccess).toBeCloseTo(0.5, 5);
    expect(result.isStale).toBe(false);
  });

  it("nowUtcIso省略時はDate.now()を使う（デフォルト引数の疎通確認）", () => {
    const history = [
      makeRow({ finished_at: new Date().toISOString() }),
    ];

    const result = evaluateStaleness(history);

    expect(result.isStale).toBe(false);
    expect(result.daysSinceLastSuccess).not.toBeNull();
    expect(result.daysSinceLastSuccess as number).toBeLessThan(1);
  });

  it("履歴配列の先頭（最初に見つかった成功行）をlastSuccessとして採用する", () => {
    const history = [
      makeRow({
        id: 5,
        status: "success",
        finished_at: "2026-07-05T00:00:00.000Z",
      }),
      makeRow({
        id: 4,
        status: "success",
        finished_at: "2026-07-01T00:00:00.000Z",
      }),
    ];

    const result = evaluateStaleness(history, "2026-07-06T00:00:00.000Z");

    expect(result.lastSuccess?.id).toBe(5);
  });
});
