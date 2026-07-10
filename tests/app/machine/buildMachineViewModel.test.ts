import { buildMachineViewModel } from "@/app/machine/buildMachineViewModel";
import type {
  ContainerStatsRow,
  CpuMetricsRow,
  MachineMetricsRow,
  OomEventRow,
} from "@/lib/db/queries/machine";
import type { Thresholds } from "@/lib/config/thresholds";

/**
 * buildMachineViewModel（純粋関数）の単体テスト。
 *
 * 軸: sinceIso="2026-07-10T02:00:00.000Z"(JST 11:00) 〜 nowUtcIso="2026-07-10T05:00:00.000Z"(JST 14:00)
 * -> axis = ["2026-07-10T11", "2026-07-10T12", "2026-07-10T13", "2026-07-10T14"]
 */

const SINCE_ISO = "2026-07-10T02:00:00.000Z";
const NOW_ISO = "2026-07-10T05:00:00.000Z";
const AXIS = ["2026-07-10T11", "2026-07-10T12", "2026-07-10T13", "2026-07-10T14"];

const THRESHOLDS: Thresholds = {
  memAvailableKb: { warning: 153600, danger: 102400 },
  swapUsedKb: { warning: 1048576, danger: 1572864 },
  dbSizeBytes: { warning: 419430400 },
  trendSampleMin: 4,
};

let nextId = 1;

function machineRow(overrides: Partial<MachineMetricsRow> & { ts_utc: string; source: string }): MachineMetricsRow {
  return {
    id: nextId++,
    mem_total_kb: null,
    mem_available_kb: null,
    mem_free_kb: null,
    swap_total_kb: null,
    swap_free_kb: null,
    loadavg_1: null,
    loadavg_5: null,
    loadavg_15: null,
    db_size_bytes: null,
    wal_size_bytes: null,
    rootfs_avail_bytes: null,
    collector_version: null,
    ...overrides,
  };
}

function containerRow(
  overrides: Partial<ContainerStatsRow> & { ts_utc: string; source: string; container_name: string },
): ContainerStatsRow {
  return {
    id: nextId++,
    cpu_pct: null,
    mem_usage_bytes: null,
    mem_limit_bytes: null,
    ...overrides,
  };
}

function cpuRow(overrides: Partial<CpuMetricsRow> & { ts_utc: string; cpu_util: number }): CpuMetricsRow {
  return { id: nextId++, ...overrides };
}

function oomRow(overrides: Partial<OomEventRow> & { occurred_at_utc: string }): OomEventRow {
  return {
    id: nextId++,
    killed_process: null,
    source: "log",
    raw_line: null,
    discovered_at: overrides.occurred_at_utc,
    ...overrides,
  };
}

function baseInput(overrides: Partial<Parameters<typeof buildMachineViewModel>[0]> = {}) {
  return {
    machineMetrics: [],
    containerStats: [],
    cpuMetrics: [],
    oomEvents: [],
    latestMetricsRow: undefined,
    sinceIso: SINCE_ISO,
    nowUtcIso: NOW_ISO,
    thresholds: THRESHOLDS,
    ...overrides,
  };
}

describe("buildMachineViewModel", () => {
  describe("axis(JST hourly)", () => {
    it("sinceIso〜nowUtcIsoのJST1時間粒度の軸を生成する", () => {
      const vm = buildMachineViewModel(baseInput());
      expect(vm.axis).toEqual(AXIS);
      expect(vm.timeline).toHaveLength(AXIS.length);
      expect(vm.timeline.map((d) => d.key)).toEqual(AXIS);
    });
  });

  describe("source統合（cron優先）", () => {
    it("同一バケットにcron→spotの順で来てもcronの値を採用する", () => {
      const vm = buildMachineViewModel(
        baseInput({
          machineMetrics: [
            machineRow({
              ts_utc: "2026-07-10T02:10:00.000Z",
              source: "cron",
              mem_available_kb: 500000,
            }),
            machineRow({
              ts_utc: "2026-07-10T02:20:00.000Z",
              source: "spot",
              mem_available_kb: 999999,
            }),
          ],
        }),
      );

      const point = vm.timeline.find((d) => d.key === "2026-07-10T11");
      expect(point?.memAvailableBytes).toBe(500000 * 1024);
    });

    it("同一バケットにspot→cronの順で来てもcronの値を採用する（到着順に依存しない）", () => {
      const vm = buildMachineViewModel(
        baseInput({
          machineMetrics: [
            machineRow({
              ts_utc: "2026-07-10T02:05:00.000Z",
              source: "spot",
              mem_available_kb: 999999,
            }),
            machineRow({
              ts_utc: "2026-07-10T02:15:00.000Z",
              source: "cron",
              mem_available_kb: 500000,
            }),
          ],
        }),
      );

      const point = vm.timeline.find((d) => d.key === "2026-07-10T11");
      expect(point?.memAvailableBytes).toBe(500000 * 1024);
    });

    it("cronが無いバケットはspotの値を採用する", () => {
      const vm = buildMachineViewModel(
        baseInput({
          machineMetrics: [
            machineRow({
              ts_utc: "2026-07-10T03:10:00.000Z",
              source: "spot",
              mem_available_kb: 700000,
            }),
          ],
        }),
      );

      const point = vm.timeline.find((d) => d.key === "2026-07-10T12");
      expect(point?.memAvailableBytes).toBe(700000 * 1024);
    });

    it("container_statsも同じcron優先規則で統合する", () => {
      const vm = buildMachineViewModel(
        baseInput({
          containerStats: [
            containerRow({
              ts_utc: "2026-07-10T02:05:00.000Z",
              source: "spot",
              container_name: "web",
              cpu_pct: 99,
              mem_usage_bytes: 99,
            }),
            containerRow({
              ts_utc: "2026-07-10T02:15:00.000Z",
              source: "cron",
              container_name: "web",
              cpu_pct: 10,
              mem_usage_bytes: 1000,
            }),
          ],
        }),
      );

      const key = vm.containerSeriesKeys.find((c) => c.name === "web");
      expect(key).toBeDefined();
      const point = vm.timeline.find((d) => d.key === "2026-07-10T11");
      expect(point?.[key!.cpuKey]).toBe(10);
      expect(point?.[key!.memKey]).toBe(1000);
    });
  });

  describe("OOMイベントのバケットスナップ+集約", () => {
    it("同一バケットに複数件ある場合は件数付きラベルに集約する", () => {
      const vm = buildMachineViewModel(
        baseInput({
          oomEvents: [
            oomRow({ occurred_at_utc: "2026-07-10T03:10:00.000Z" }),
            oomRow({ occurred_at_utc: "2026-07-10T03:40:00.000Z" }),
          ],
        }),
      );

      expect(vm.oomMarkers).toEqual([{ key: "2026-07-10T12", label: "OOM x2" }]);
    });

    it("単発の場合は件数を付けない", () => {
      const vm = buildMachineViewModel(
        baseInput({
          oomEvents: [oomRow({ occurred_at_utc: "2026-07-10T04:15:00.000Z" })],
        }),
      );

      expect(vm.oomMarkers).toEqual([{ key: "2026-07-10T13", label: "OOM" }]);
    });

    it("複数バケットに分散している場合は別々のマーカーになる", () => {
      const vm = buildMachineViewModel(
        baseInput({
          oomEvents: [
            oomRow({ occurred_at_utc: "2026-07-10T03:10:00.000Z" }),
            oomRow({ occurred_at_utc: "2026-07-10T04:15:00.000Z" }),
          ],
        }),
      );

      expect(vm.oomMarkers).toEqual(
        expect.arrayContaining([
          { key: "2026-07-10T12", label: "OOM" },
          { key: "2026-07-10T13", label: "OOM" },
        ]),
      );
      expect(vm.oomMarkers).toHaveLength(2);
    });
  });

  describe("CPU使用率(0-1)のパーセント変換とバケット平均", () => {
    it("0.0-1.0を0-100%へ変換する", () => {
      const vm = buildMachineViewModel(
        baseInput({
          cpuMetrics: [cpuRow({ ts_utc: "2026-07-10T03:05:00.000Z", cpu_util: 0.5 })],
        }),
      );

      const point = vm.timeline.find((d) => d.key === "2026-07-10T12");
      expect(point?.cpuUtilPercent).toBe(50);
    });

    it("同一バケット複数サンプルは算術平均を採る", () => {
      const vm = buildMachineViewModel(
        baseInput({
          cpuMetrics: [
            cpuRow({ ts_utc: "2026-07-10T02:05:00.000Z", cpu_util: 0.2 }),
            cpuRow({ ts_utc: "2026-07-10T02:35:00.000Z", cpu_util: 0.4 }),
          ],
        }),
      );

      const point = vm.timeline.find((d) => d.key === "2026-07-10T11");
      expect(point?.cpuUtilPercent).toBeCloseTo(30);
    });
  });

  describe("メモリ/スワップのKB->bytes変換", () => {
    it("mem_available_kbをbytesへ変換する", () => {
      const vm = buildMachineViewModel(
        baseInput({
          machineMetrics: [
            machineRow({
              ts_utc: "2026-07-10T02:10:00.000Z",
              source: "cron",
              mem_available_kb: 12345,
            }),
          ],
        }),
      );

      const point = vm.timeline.find((d) => d.key === "2026-07-10T11");
      expect(point?.memAvailableBytes).toBe(12345 * 1024);
    });

    it("swap_total_kb - swap_free_kbをbytesへ変換する", () => {
      const vm = buildMachineViewModel(
        baseInput({
          machineMetrics: [
            machineRow({
              ts_utc: "2026-07-10T02:10:00.000Z",
              source: "cron",
              swap_total_kb: 2000000,
              swap_free_kb: 1500000,
            }),
          ],
        }),
      );

      const point = vm.timeline.find((d) => d.key === "2026-07-10T11");
      expect(point?.swapUsedBytes).toBe((2000000 - 1500000) * 1024);
    });

    it("閾値もKB->bytesへ変換して揃える", () => {
      const vm = buildMachineViewModel(baseInput());

      expect(vm.memoryThresholds).toEqual([
        { value: THRESHOLDS.memAvailableKb.warning * 1024, level: "warning", label: "注意" },
        { value: THRESHOLDS.memAvailableKb.danger * 1024, level: "danger", label: "危険" },
      ]);
      expect(vm.swapThresholds).toEqual([
        { value: THRESHOLDS.swapUsedKb.warning * 1024, level: "warning", label: "注意" },
        { value: THRESHOLDS.swapUsedKb.danger * 1024, level: "danger", label: "危険" },
      ]);
      // DBサイズはbytes単位で保存されているため、KB変換はしない
      expect(vm.dbSizeThresholds).toEqual([
        { value: THRESHOLDS.dbSizeBytes.warning, level: "warning", label: "注意" },
      ]);
    });
  });

  describe("欠測の扱い（ゼロ埋めしない）", () => {
    it("行が存在しないバケットは全指標がnullになる", () => {
      const vm = buildMachineViewModel(baseInput());

      const point = vm.timeline.find((d) => d.key === "2026-07-10T14");
      expect(point).toEqual({
        key: "2026-07-10T14",
        timestampUtc: undefined,
        memAvailableBytes: null,
        swapUsedBytes: null,
        loadavg1: null,
        loadavg5: null,
        loadavg15: null,
        dbSizeBytes: null,
        cpuUtilPercent: null,
      });
    });

    it("行はあるが個別フィールドが欠測(null)の場合はゼロ埋めせずnullを保持する", () => {
      const vm = buildMachineViewModel(
        baseInput({
          machineMetrics: [
            machineRow({
              ts_utc: "2026-07-10T04:10:00.000Z",
              source: "cron",
              mem_available_kb: 100000,
              loadavg_1: null,
              swap_total_kb: null,
              swap_free_kb: 100,
            }),
          ],
        }),
      );

      const point = vm.timeline.find((d) => d.key === "2026-07-10T13");
      expect(point?.memAvailableBytes).toBe(100000 * 1024);
      expect(point?.loadavg1).toBeNull();
      // swap_total_kbが欠測のため、swapUsedBytesは0扱いにせずnullのまま
      expect(point?.swapUsedBytes).toBeNull();
    });

    it("db_size_bytesがnullのバケットはdbSizeBytesがnullになる（wal単独での補完はしない）", () => {
      const vm = buildMachineViewModel(
        baseInput({
          machineMetrics: [
            machineRow({
              ts_utc: "2026-07-10T04:10:00.000Z",
              source: "cron",
              db_size_bytes: null,
              wal_size_bytes: 500,
            }),
          ],
        }),
      );

      const point = vm.timeline.find((d) => d.key === "2026-07-10T13");
      expect(point?.dbSizeBytes).toBeNull();
    });
  });

  describe("db_size_bytes + wal_size_bytesの部分和", () => {
    it("wal_size_bytesが欠測(null)の場合はdb_size_bytes単体を採用する（意図的仕様）", () => {
      const vm = buildMachineViewModel(
        baseInput({
          machineMetrics: [
            machineRow({
              ts_utc: "2026-07-10T02:10:00.000Z",
              source: "cron",
              db_size_bytes: 1000000,
              wal_size_bytes: null,
            }),
          ],
        }),
      );

      const point = vm.timeline.find((d) => d.key === "2026-07-10T11");
      expect(point?.dbSizeBytes).toBe(1000000);
    });

    it("両方存在する場合は合算する", () => {
      const vm = buildMachineViewModel(
        baseInput({
          machineMetrics: [
            machineRow({
              ts_utc: "2026-07-10T02:10:00.000Z",
              source: "cron",
              db_size_bytes: 1000000,
              wal_size_bytes: 200000,
            }),
          ],
        }),
      );

      const point = vm.timeline.find((d) => d.key === "2026-07-10T11");
      expect(point?.dbSizeBytes).toBe(1200000);
    });
  });

  describe("containerSeriesKeys", () => {
    it("コンテナ名をソートしdataKeyを連番で割り当てる", () => {
      const vm = buildMachineViewModel(
        baseInput({
          containerStats: [
            containerRow({
              ts_utc: "2026-07-10T02:10:00.000Z",
              source: "cron",
              container_name: "worker",
              cpu_pct: 5,
              mem_usage_bytes: 500,
            }),
            containerRow({
              ts_utc: "2026-07-10T02:10:00.000Z",
              source: "cron",
              container_name: "web",
              cpu_pct: 10,
              mem_usage_bytes: 1000,
            }),
          ],
        }),
      );

      expect(vm.containerSeriesKeys).toEqual([
        { name: "web", cpuKey: "container0Cpu", memKey: "container0Mem" },
        { name: "worker", cpuKey: "container1Cpu", memKey: "container1Mem" },
      ]);
    });

    it("コンテナデータが存在しないバケットはnullになる", () => {
      const vm = buildMachineViewModel(
        baseInput({
          containerStats: [
            containerRow({
              ts_utc: "2026-07-10T02:10:00.000Z",
              source: "cron",
              container_name: "web",
              cpu_pct: 10,
              mem_usage_bytes: 1000,
            }),
          ],
        }),
      );

      const point = vm.timeline.find((d) => d.key === "2026-07-10T12");
      expect(point?.container0Cpu).toBeNull();
      expect(point?.container0Mem).toBeNull();
    });
  });

  describe("status/latestSampleUtcのrange非依存性", () => {
    it("latestMetricsRowから状態を評価する（machineMetricsが空でも評価できる）", () => {
      const latest = machineRow({
        ts_utc: "2026-07-10T09:00:00.000Z", // rangeの外の時刻でもよい
        source: "cron",
        mem_available_kb: 50000, // danger(<=102400)
      });

      const vm = buildMachineViewModel(
        baseInput({
          machineMetrics: [], // range内データなし
          latestMetricsRow: latest,
        }),
      );

      expect(vm.status.level).toBe("danger");
      expect(vm.status.reasons.length).toBeGreaterThan(0);
      expect(vm.latestSampleUtc).toBe("2026-07-10T09:00:00.000Z");
    });

    it("latestMetricsRowがundefinedの場合、状態は正常(理由なし)、latestSampleUtcはnull", () => {
      const vm = buildMachineViewModel(
        baseInput({
          machineMetrics: [
            machineRow({
              ts_utc: "2026-07-10T02:10:00.000Z",
              source: "cron",
              mem_available_kb: 1, // rangeスコープには危険な値があっても
            }),
          ],
          latestMetricsRow: undefined,
        }),
      );

      expect(vm.status).toEqual({ level: "normal", reasons: [] });
      expect(vm.latestSampleUtc).toBeNull();
    });

    it("machineMetrics(range内)の最新値とlatestMetricsRowが食い違う場合、latestMetricsRow側が優先される", () => {
      const latestNormal = machineRow({
        ts_utc: "2026-07-10T09:30:00.000Z",
        source: "cron",
        mem_available_kb: 900000, // normal
      });

      const vm = buildMachineViewModel(
        baseInput({
          machineMetrics: [
            machineRow({
              ts_utc: "2026-07-10T04:59:00.000Z",
              source: "cron",
              mem_available_kb: 1, // rangeスコープ内は危険な値
            }),
          ],
          latestMetricsRow: latestNormal,
        }),
      );

      expect(vm.status.level).toBe("normal");
      expect(vm.latestSampleUtc).toBe("2026-07-10T09:30:00.000Z");
    });
  });

  describe("トレンド算出", () => {
    it("軸上のmemAvailable/dbSizeサンプル列からトレンドを計算する", () => {
      const vm = buildMachineViewModel(
        baseInput({
          machineMetrics: [
            machineRow({
              ts_utc: "2026-07-10T02:10:00.000Z",
              source: "cron",
              mem_available_kb: 1000000,
              db_size_bytes: 100,
            }),
            machineRow({
              ts_utc: "2026-07-10T03:10:00.000Z",
              source: "cron",
              mem_available_kb: 500000,
              db_size_bytes: 200,
            }),
          ],
        }),
      );

      expect(vm.memAvailableTrend.direction).toBe("decreasing");
      expect(vm.memAvailableTrend.sampleCount).toBe(2);
      expect(vm.dbSizeTrend.direction).toBe("increasing");
      expect(vm.dbSizeTrend.sampleCount).toBe(2);
      // trendSampleMin(4)未満のため参考値
      expect(vm.memAvailableTrend.isReference).toBe(true);
      expect(vm.dbSizeTrend.isReference).toBe(true);
    });
  });
});
