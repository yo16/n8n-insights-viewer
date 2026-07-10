import {
  buildStatusInputFromMachineMetrics,
  evaluateStatus,
  type StatusEvaluationInput,
} from "../../../src/lib/aggregation/status";
import type { Thresholds } from "../../../src/lib/config/thresholds";
import type { MachineMetricsRow } from "../../../src/lib/db/queries/machine";

const THRESHOLDS: Thresholds = {
  memAvailableKb: { warning: 153600, danger: 102400 },
  swapUsedKb: { warning: 1048576, danger: 1572864 },
  dbSizeBytes: { warning: 419430400 },
  trendSampleMin: 4,
};

function input(overrides: Partial<StatusEvaluationInput> = {}): StatusEvaluationInput {
  return {
    memAvailableKb: null,
    swapUsedKb: null,
    dbSizeBytes: null,
    ...overrides,
  };
}

describe("lib/aggregation/status", () => {
  describe("evaluateStatus: 正常系", () => {
    it("すべての指標が閾値未満/未満の場合はnormalでreasonsは空", () => {
      const result = evaluateStatus(
        input({ memAvailableKb: 999999, swapUsedKb: 0, dbSizeBytes: 0 }),
        THRESHOLDS,
      );
      expect(result.level).toBe("normal");
      expect(result.reasons).toEqual([]);
    });

    it("すべての指標がnullの場合はnormal扱いになる", () => {
      const result = evaluateStatus(input(), THRESHOLDS);
      expect(result.level).toBe("normal");
      expect(result.reasons).toEqual([]);
    });
  });

  describe("evaluateStatus: 閾値ちょうどでの発火（包含比較の境界値）", () => {
    it("MemAvailableが警告閾値ちょうど(153600)でwarningが発火する", () => {
      const result = evaluateStatus(input({ memAvailableKb: 153600 }), THRESHOLDS);
      expect(result.level).toBe("warning");
      expect(result.reasons).toEqual([
        expect.stringContaining("MemAvailable 153600KB"),
      ]);
    });

    it("MemAvailableが警告閾値+1(153601)ではnormalのまま（閾値未満は発火しない）", () => {
      const result = evaluateStatus(input({ memAvailableKb: 153601 }), THRESHOLDS);
      expect(result.level).toBe("normal");
      expect(result.reasons).toEqual([]);
    });

    it("MemAvailableが危険閾値ちょうど(102400)でdangerが発火する", () => {
      const result = evaluateStatus(input({ memAvailableKb: 102400 }), THRESHOLDS);
      expect(result.level).toBe("danger");
      expect(result.reasons).toEqual([
        expect.stringContaining("MemAvailable 102400KB"),
      ]);
    });

    it("スワップ使用量が警告閾値ちょうど(1048576)でwarningが発火する", () => {
      const result = evaluateStatus(input({ swapUsedKb: 1048576 }), THRESHOLDS);
      expect(result.level).toBe("warning");
      expect(result.reasons).toEqual([
        expect.stringContaining("スワップ使用量 1048576KB"),
      ]);
    });

    it("スワップ使用量が警告閾値-1(1048575)ではnormalのまま", () => {
      const result = evaluateStatus(input({ swapUsedKb: 1048575 }), THRESHOLDS);
      expect(result.level).toBe("normal");
    });

    it("スワップ使用量が危険閾値ちょうど(1572864)でdangerが発火する", () => {
      const result = evaluateStatus(input({ swapUsedKb: 1572864 }), THRESHOLDS);
      expect(result.level).toBe("danger");
      expect(result.reasons).toEqual([
        expect.stringContaining("スワップ使用量 1572864KB"),
      ]);
    });

    it("DBサイズが警告閾値ちょうど(419430400)でwarningが発火する（危険閾値は設定なし）", () => {
      const result = evaluateStatus(input({ dbSizeBytes: 419430400 }), THRESHOLDS);
      expect(result.level).toBe("warning");
      expect(result.reasons).toEqual([
        expect.stringContaining("DBサイズ 419430400bytes"),
      ]);
    });

    it("DBサイズが警告閾値-1(419430399)ではnormalのまま", () => {
      const result = evaluateStatus(input({ dbSizeBytes: 419430399 }), THRESHOLDS);
      expect(result.level).toBe("normal");
    });
  });

  describe("evaluateStatus: 複数指標同時悪化時の最重レベル採用", () => {
    it("MemAvailableがdanger・DBサイズがwarningの場合は全体がdangerになる", () => {
      const result = evaluateStatus(
        input({ memAvailableKb: 102400, dbSizeBytes: 419430400 }),
        THRESHOLDS,
      );
      expect(result.level).toBe("danger");
      expect(result.reasons).toHaveLength(2);
    });

    it("複数指標が同時にwarningの場合はreasonsに両方含まれる", () => {
      const result = evaluateStatus(
        input({ swapUsedKb: 1048576, dbSizeBytes: 419430400 }),
        THRESHOLDS,
      );
      expect(result.level).toBe("warning");
      expect(result.reasons).toHaveLength(2);
    });

    it("MemAvailareがnormal、swapがdanger、dbSizeがwarningの場合はdangerが採用される", () => {
      const result = evaluateStatus(
        input({ memAvailableKb: 999999, swapUsedKb: 1572864, dbSizeBytes: 419430400 }),
        THRESHOLDS,
      );
      expect(result.level).toBe("danger");
      expect(result.reasons).toHaveLength(2);
    });
  });

  describe("buildStatusInputFromMachineMetrics", () => {
    function machineRow(overrides: Partial<MachineMetricsRow> = {}): MachineMetricsRow {
      return {
        ts_utc: "2026-01-01T00:00:00.000Z",
        mem_available_kb: 200000,
        mem_total_kb: 1000000,
        swap_total_kb: 2000000,
        swap_free_kb: 1900000,
        db_size_bytes: 100,
        wal_size_bytes: 50,
        ...overrides,
      } as MachineMetricsRow;
    }

    it("行が無い(undefined)場合はすべてnullを返す", () => {
      const result = buildStatusInputFromMachineMetrics(undefined);
      expect(result).toEqual({
        memAvailableKb: null,
        swapUsedKb: null,
        dbSizeBytes: null,
      });
    });

    it("swap_total_kb - swap_free_kbでswapUsedKbを計算する", () => {
      const result = buildStatusInputFromMachineMetrics(
        machineRow({ swap_total_kb: 2000000, swap_free_kb: 1900000 }),
      );
      expect(result.swapUsedKb).toBe(100000);
    });

    it("db_size_bytes + wal_size_bytesでdbSizeBytesを計算する", () => {
      const result = buildStatusInputFromMachineMetrics(
        machineRow({ db_size_bytes: 100, wal_size_bytes: 50 }),
      );
      expect(result.dbSizeBytes).toBe(150);
    });

    it("wal_size_bytesがnullの場合は0として扱う", () => {
      const result = buildStatusInputFromMachineMetrics(
        machineRow({ db_size_bytes: 100, wal_size_bytes: null }),
      );
      expect(result.dbSizeBytes).toBe(100);
    });

    it("swap_total_kb/swap_free_kbのいずれかがnullの場合はswapUsedKbはnull", () => {
      const result = buildStatusInputFromMachineMetrics(
        machineRow({ swap_total_kb: null, swap_free_kb: 1900000 }),
      );
      expect(result.swapUsedKb).toBeNull();
    });

    it("db_size_bytesがnullの場合はdbSizeBytesはnull", () => {
      const result = buildStatusInputFromMachineMetrics(
        machineRow({ db_size_bytes: null, wal_size_bytes: 50 }),
      );
      expect(result.dbSizeBytes).toBeNull();
    });

    it("mem_available_kbはそのままmemAvailableKbに渡される", () => {
      const result = buildStatusInputFromMachineMetrics(machineRow({ mem_available_kb: 12345 }));
      expect(result.memAvailableKb).toBe(12345);
    });
  });
});
