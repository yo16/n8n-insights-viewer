import fs from "fs";
import os from "os";
import path from "path";

import Database from "better-sqlite3";

import { initializeDatabase } from "../../../src/shared/db/init";
import {
  upsertContainerStat,
  upsertCpuMetric,
  upsertMachineMetric,
  upsertOomEvent,
} from "../../../scripts/sync/collectMetricsUpsert";

/**
 * collectMetricsUpsert.ts の単体テスト。
 *
 * docs/design/db-design.md §3.2 の UNIQUE 制約に基づくUPSERTの重複防止を検証する
 * （同じ ts_utc/source 等の再取り込みで行が増えず、値のみ更新されること）。
 */
describe("collectMetricsUpsert", () => {
  let tmpDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "n8n-insights-viewer-collect-upsert-test-"),
    );
    db = new Database(path.join(tmpDir, "test.sqlite"));
    initializeDatabase(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("upsertMachineMetric", () => {
    it("同じ(ts_utc, source)の再取り込みで重複せず、値が更新される", () => {
      upsertMachineMetric(db, {
        tsUtc: "2026-07-10T05:17:03.000Z",
        source: "spot",
        memTotalKb: 977000,
        memAvailableKb: 100000,
      });
      upsertMachineMetric(db, {
        tsUtc: "2026-07-10T05:17:03.000Z",
        source: "spot",
        memTotalKb: 977000,
        memAvailableKb: 90000, // 値だけ更新
      });

      const rows = db.prepare("SELECT * FROM machine_metrics").all();
      expect(rows).toHaveLength(1);
      expect((rows[0] as { mem_available_kb: number }).mem_available_kb).toBe(
        90000,
      );
    });

    it("sourceが異なれば別行として挿入される", () => {
      upsertMachineMetric(db, {
        tsUtc: "2026-07-10T05:17:03.000Z",
        source: "spot",
      });
      upsertMachineMetric(db, {
        tsUtc: "2026-07-10T05:17:03.000Z",
        source: "cron",
      });

      const rows = db.prepare("SELECT * FROM machine_metrics").all();
      expect(rows).toHaveLength(2);
    });
  });

  describe("upsertContainerStat", () => {
    it("同じ(ts_utc, source, container_name)の再取り込みで重複しない", () => {
      upsertContainerStat(db, {
        tsUtc: "2026-07-10T05:17:03.000Z",
        source: "spot",
        containerName: "n8n",
        cpuPct: 3.2,
      });
      upsertContainerStat(db, {
        tsUtc: "2026-07-10T05:17:03.000Z",
        source: "spot",
        containerName: "n8n",
        cpuPct: 5.0,
      });

      const rows = db.prepare("SELECT * FROM container_stats").all();
      expect(rows).toHaveLength(1);
      expect((rows[0] as { cpu_pct: number }).cpu_pct).toBe(5.0);
    });
  });

  describe("upsertCpuMetric", () => {
    it("同じts_utcの再取り込みで重複しない", () => {
      upsertCpuMetric(db, { tsUtc: "2026-07-10T05:00:00.000Z", cpuUtil: 0.1 });
      upsertCpuMetric(db, { tsUtc: "2026-07-10T05:00:00.000Z", cpuUtil: 0.2 });

      const rows = db.prepare("SELECT * FROM cpu_metrics").all();
      expect(rows).toHaveLength(1);
      expect((rows[0] as { cpu_util: number }).cpu_util).toBe(0.2);
    });
  });

  describe("upsertOomEvent", () => {
    it("同じ(occurred_at_utc, killed_process)の再取り込みで重複せず、discovered_atは初回値を保持する", () => {
      upsertOomEvent(db, {
        occurredAtUtc: "2026-07-05T03:12:45.000Z",
        killedProcess: "node",
        source: "journalctl",
        rawLine: "Out of memory: Killed process 1234 (node)",
        discoveredAt: "2026-07-06T00:00:00.000Z",
      });
      upsertOomEvent(db, {
        occurredAtUtc: "2026-07-05T03:12:45.000Z",
        killedProcess: "node",
        source: "journalctl",
        rawLine: "Out of memory: Killed process 1234 (node) [再取得]",
        discoveredAt: "2026-07-07T00:00:00.000Z", // 再回収時刻(初回値を上書きしないはず)
      });

      const rows = db.prepare("SELECT * FROM oom_events").all() as Array<
        Record<string, unknown>
      >;
      expect(rows).toHaveLength(1);
      expect(rows[0].discovered_at).toBe("2026-07-06T00:00:00.000Z");
      expect(rows[0].raw_line).toBe(
        "Out of memory: Killed process 1234 (node) [再取得]",
      );
    });
  });
});
