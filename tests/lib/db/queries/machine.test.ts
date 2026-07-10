import Database from "better-sqlite3";

import { createTestDb } from "../testDbHelper";
import {
  getCpuMetrics,
  getContainerStats,
  getMachineMetrics,
  getOomEvents,
} from "../../../../src/lib/db/queries/machine";

/**
 * src/lib/db/queries/machine.ts の単体テスト
 * (docs/design/api-design.md §6, docs/design/frontend-design.md 画面5)
 */
describe("queries/machine", () => {
  let db: Database.Database;
  let cleanup: () => void;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => {
    cleanup();
  });

  describe("getMachineMetrics", () => {
    it("期間内をts_utc昇順で返す", () => {
      const insert = db.prepare(
        "INSERT INTO machine_metrics (ts_utc, source, mem_available_kb) VALUES (?, ?, ?)",
      );
      insert.run("2026-06-30T00:00:00.000Z", "cron", 100000);
      insert.run("2026-07-01T00:00:00.000Z", "cron", 90000);
      insert.run("2026-07-02T00:00:00.000Z", "cron", 80000);

      const rows = getMachineMetrics(db, {
        sinceIso: "2026-07-01T00:00:00.000Z",
        untilIso: "2026-07-02T00:00:00.000Z",
      });

      expect(rows.map((r) => r.ts_utc)).toEqual(["2026-07-01T00:00:00.000Z"]);
    });

    it("空DBでは空配列を返す", () => {
      expect(getMachineMetrics(db, { sinceIso: "2026-07-01T00:00:00.000Z" })).toEqual(
        [],
      );
    });
  });

  describe("getContainerStats", () => {
    it("コンテナ別のstatsを期間内で返す", () => {
      const insert = db.prepare(
        "INSERT INTO container_stats (ts_utc, source, container_name, cpu_pct) VALUES (?, ?, ?, ?)",
      );
      insert.run("2026-07-01T00:00:00.000Z", "cron", "n8n", 12.5);
      insert.run("2026-07-01T00:00:00.000Z", "cron", "traefik", 1.2);

      const rows = getContainerStats(db, {
        sinceIso: "2026-07-01T00:00:00.000Z",
      });

      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.container_name).sort()).toEqual([
        "n8n",
        "traefik",
      ]);
    });

    it("空DBでは空配列を返す", () => {
      expect(
        getContainerStats(db, { sinceIso: "2026-07-01T00:00:00.000Z" }),
      ).toEqual([]);
    });
  });

  describe("getCpuMetrics", () => {
    it("期間内のcpu_metricsを昇順で返す", () => {
      const insert = db.prepare(
        "INSERT INTO cpu_metrics (ts_utc, cpu_util) VALUES (?, ?)",
      );
      insert.run("2026-07-02T00:00:00.000Z", 0.5);
      insert.run("2026-07-01T00:00:00.000Z", 0.3);

      const rows = getCpuMetrics(db, { sinceIso: "2026-07-01T00:00:00.000Z" });

      expect(rows.map((r) => r.cpu_util)).toEqual([0.3, 0.5]);
    });

    it("空DBでは空配列を返す", () => {
      expect(getCpuMetrics(db, { sinceIso: "2026-07-01T00:00:00.000Z" })).toEqual(
        [],
      );
    });
  });

  describe("getOomEvents", () => {
    it("occurred_at_utcで期間内を昇順で返す", () => {
      const insert = db.prepare(
        `INSERT INTO oom_events
          (occurred_at_utc, killed_process, source, raw_line, discovered_at)
         VALUES (?, ?, ?, ?, ?)`,
      );
      insert.run(
        "2026-07-02T00:00:00.000Z",
        "node",
        "journalctl",
        "raw2",
        "2026-07-03T00:00:00.000Z",
      );
      insert.run(
        "2026-07-01T00:00:00.000Z",
        "node",
        "journalctl",
        "raw1",
        "2026-07-03T00:00:00.000Z",
      );

      const rows = getOomEvents(db, { sinceIso: "2026-07-01T00:00:00.000Z" });

      expect(rows.map((r) => r.raw_line)).toEqual(["raw1", "raw2"]);
    });

    it("空DBでは空配列を返す", () => {
      expect(getOomEvents(db, { sinceIso: "2026-07-01T00:00:00.000Z" })).toEqual(
        [],
      );
    });
  });
});
