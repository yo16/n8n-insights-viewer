import Database from "better-sqlite3";

import { createTestDb } from "../testDbHelper";
import {
  getInsightsSummary,
  getLatestMachineMetrics,
  getRecentMachineMetricsSeries,
} from "../../../../src/lib/db/queries/dashboard";

/**
 * src/lib/db/queries/dashboard.ts の単体テスト
 * (docs/design/api-design.md §6, docs/design/frontend-design.md 画面1)
 */
describe("queries/dashboard", () => {
  let db: Database.Database;
  let cleanup: () => void;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => {
    cleanup();
  });

  describe("getInsightsSummary", () => {
    it("success/failure/runtimeを集計し、成功率を算出する", () => {
      const insert = db.prepare(
        "INSERT INTO insights_by_period (metaId, type, value, periodUnit, periodStart) VALUES (?, ?, ?, ?, ?)",
      );
      // type: 1=runtime_ms, 2=success, 3=failure
      insert.run(1, 2, 80, 1, "2026-07-01T00:00:00.000Z");
      insert.run(1, 3, 20, 1, "2026-07-01T00:00:00.000Z");
      insert.run(1, 1, 1000, 1, "2026-07-01T00:00:00.000Z");
      insert.run(1, 2, 10, 1, "2026-07-02T00:00:00.000Z");

      const summary = getInsightsSummary(db, "2026-07-01T00:00:00.000Z");

      expect(summary.successCount).toBe(90);
      expect(summary.failureCount).toBe(20);
      expect(summary.totalRuntimeMs).toBe(1000);
      expect(summary.totalExecutions).toBe(110);
      expect(summary.successRate).toBeCloseTo(90 / 110);
    });

    it("untilIso指定で期間の上限を絞り込める", () => {
      const insert = db.prepare(
        "INSERT INTO insights_by_period (metaId, type, value, periodUnit, periodStart) VALUES (?, ?, ?, ?, ?)",
      );
      insert.run(1, 2, 10, 1, "2026-07-01T00:00:00.000Z");
      insert.run(1, 2, 20, 1, "2026-07-05T00:00:00.000Z");

      const summary = getInsightsSummary(
        db,
        "2026-07-01T00:00:00.000Z",
        "2026-07-03T00:00:00.000Z",
      );

      expect(summary.successCount).toBe(10);
    });

    it("該当データが無い場合はすべて0でsuccessRateはnull", () => {
      const summary = getInsightsSummary(db, "2026-07-01T00:00:00.000Z");

      expect(summary.successCount).toBe(0);
      expect(summary.failureCount).toBe(0);
      expect(summary.totalRuntimeMs).toBe(0);
      expect(summary.totalExecutions).toBe(0);
      expect(summary.successRate).toBeNull();
    });
  });

  describe("getLatestMachineMetrics", () => {
    it("最新（ts_utc最大）の1件を返す", () => {
      const insert = db.prepare(
        "INSERT INTO machine_metrics (ts_utc, source, mem_available_kb) VALUES (?, ?, ?)",
      );
      insert.run("2026-07-01T00:00:00.000Z", "cron", 100000);
      insert.run("2026-07-03T00:00:00.000Z", "cron", 90000);
      insert.run("2026-07-02T00:00:00.000Z", "cron", 95000);

      const latest = getLatestMachineMetrics(db);

      expect(latest?.ts_utc).toBe("2026-07-03T00:00:00.000Z");
      expect(latest?.mem_available_kb).toBe(90000);
    });

    it("データが無い場合はundefinedを返す", () => {
      expect(getLatestMachineMetrics(db)).toBeUndefined();
    });
  });

  describe("getRecentMachineMetricsSeries", () => {
    it("sinceIso以降を時系列昇順で返す", () => {
      const insert = db.prepare(
        "INSERT INTO machine_metrics (ts_utc, source, mem_available_kb) VALUES (?, ?, ?)",
      );
      insert.run("2026-06-30T00:00:00.000Z", "cron", 100000);
      insert.run("2026-07-01T00:00:00.000Z", "cron", 90000);
      insert.run("2026-07-02T00:00:00.000Z", "cron", 80000);

      const series = getRecentMachineMetricsSeries(
        db,
        "2026-07-01T00:00:00.000Z",
      );

      expect(series).toHaveLength(2);
      expect(series.map((s) => s.ts_utc)).toEqual([
        "2026-07-01T00:00:00.000Z",
        "2026-07-02T00:00:00.000Z",
      ]);
    });

    it("空DBでは空配列を返す", () => {
      expect(getRecentMachineMetricsSeries(db, "2026-07-01T00:00:00.000Z")).toEqual(
        [],
      );
    });
  });
});
