import { InsightsMetricType } from "../../../src/shared/types";
import type { NormalizedDailyInsightsPoint } from "../../../src/lib/aggregation/insightsNormalization";
import {
  buildInsightsChartData,
  resolveQueryFromIso,
} from "../../../src/app/insights/viewModel";

/**
 * src/app/insights/viewModel.ts の単体テスト。
 *
 * 重点: `buildInsightsChartData` の欠測(null) vs 実ゼロ(0)のルール
 * （最終データ日以前は0埋め/以後はnull）、type=0除外、hasApproxPointsフラグ、
 * 期間クランプ、全期間時の軸開始=最古データ日。
 */

function point(
  overrides: Partial<NormalizedDailyInsightsPoint> & Pick<NormalizedDailyInsightsPoint, "dayKey" | "type" | "value">,
): NormalizedDailyInsightsPoint {
  return {
    isApprox: false,
    workflowId: null,
    workflowName: null,
    ...overrides,
  };
}

describe("app/insights/viewModel", () => {
  describe("resolveQueryFromIso", () => {
    it("range='all'の場合はUNIXエポック開始（1970-01-01）を返す", () => {
      expect(resolveQueryFromIso("all", "2026-01-10T00:00:00.000Z")).toBe(
        "1970-01-01T00:00:00.000Z",
      );
    });

    it("range='7d'の場合、now - (7+1)日 を返す（クエリ下限バッファ含む）", () => {
      const now = "2026-01-10T00:00:00.000Z";
      const result = resolveQueryFromIso("7d", now);
      const expected = new Date(
        new Date(now).getTime() - 8 * 24 * 60 * 60 * 1000,
      ).toISOString();
      expect(result).toBe(expected);
    });

    it("range='30d'の場合、now - (30+1)日 を返す", () => {
      const now = "2026-01-10T00:00:00.000Z";
      const result = resolveQueryFromIso("30d", now);
      const expected = new Date(
        new Date(now).getTime() - 31 * 24 * 60 * 60 * 1000,
      ).toISOString();
      expect(result).toBe(expected);
    });

    it("range='90d'の場合、now - (90+1)日 を返す", () => {
      const now = "2026-01-10T00:00:00.000Z";
      const result = resolveQueryFromIso("90d", now);
      const expected = new Date(
        new Date(now).getTime() - 91 * 24 * 60 * 60 * 1000,
      ).toISOString();
      expect(result).toBe(expected);
    });
  });

  describe("buildInsightsChartData", () => {
    it("正規化済みデータが空の場合はhasAnyData=falseで空データを返す", () => {
      const nowUtcIso = "2026-01-10T03:00:00.000Z";
      const result = buildInsightsChartData([], "7d", nowUtcIso);

      expect(result).toEqual({
        executionsData: [],
        runtimeData: [],
        hasAnyData: false,
        lastDataDayKey: null,
        todayDayKey: "2026-01-10",
        hasApproxPoints: false,
      });
    });

    it("type=0（time_saved_min）のみの場合は表示対象外のためhasAnyData=falseになる", () => {
      const nowUtcIso = "2026-01-10T03:00:00.000Z";
      const normalized: NormalizedDailyInsightsPoint[] = [
        point({ dayKey: "2026-01-08", type: InsightsMetricType.TimeSavedMin, value: 42 }),
      ];

      const result = buildInsightsChartData(normalized, "7d", nowUtcIso);

      expect(result.hasAnyData).toBe(false);
      expect(result.lastDataDayKey).toBeNull();
    });

    it("最終データ日以前は0埋め、それ以降(今日まで)はnull（欠測）になる: range=7d", () => {
      // nowUtcIso = 2026-01-10T03:00 UTC -> JST 12:00 同日 -> todayDayKey = 2026-01-10
      const nowUtcIso = "2026-01-10T03:00:00.000Z";
      const normalized: NormalizedDailyInsightsPoint[] = [
        point({ dayKey: "2026-01-08", type: InsightsMetricType.Success, value: 5 }),
        point({ dayKey: "2026-01-08", type: InsightsMetricType.Failure, value: 1 }),
        point({ dayKey: "2026-01-08", type: InsightsMetricType.RuntimeMs, value: 1000 }),
      ];

      const result = buildInsightsChartData(normalized, "7d", nowUtcIso);

      expect(result.hasAnyData).toBe(true);
      expect(result.lastDataDayKey).toBe("2026-01-08");
      expect(result.todayDayKey).toBe("2026-01-10");
      expect(result.hasApproxPoints).toBe(false);

      // range=7d -> 軸は today - 6日 = 2026-01-04 〜 2026-01-10（7日分）
      expect(result.executionsData.map((d) => d.key)).toEqual([
        "2026-01-04",
        "2026-01-05",
        "2026-01-06",
        "2026-01-07",
        "2026-01-08",
        "2026-01-09",
        "2026-01-10",
      ]);

      // 01-04〜01-07: データ行は無いが lastDataDayKey(01-08)以前 -> 実ゼロ(0)
      for (const key of ["2026-01-04", "2026-01-05", "2026-01-06", "2026-01-07"]) {
        const datum = result.executionsData.find((d) => d.key === key)!;
        expect(datum.success).toBe(0);
        expect(datum.failure).toBe(0);
        const runtimeDatum = result.runtimeData.find((d) => d.key === key)!;
        expect(runtimeDatum.runtimeMs).toBe(0);
      }

      // 01-08: 実データ
      const dataDay = result.executionsData.find((d) => d.key === "2026-01-08")!;
      expect(dataDay.success).toBe(5);
      expect(dataDay.failure).toBe(1);
      const runtimeDataDay = result.runtimeData.find((d) => d.key === "2026-01-08")!;
      expect(runtimeDataDay.runtimeMs).toBe(1000);

      // 01-09, 01-10: lastDataDayKeyより後 -> 欠測(null)
      for (const key of ["2026-01-09", "2026-01-10"]) {
        const datum = result.executionsData.find((d) => d.key === key)!;
        expect(datum.success).toBeNull();
        expect(datum.failure).toBeNull();
        const runtimeDatum = result.runtimeData.find((d) => d.key === key)!;
        expect(runtimeDatum.runtimeMs).toBeNull();
      }
    });

    it("同一日の複数typeの値は正しく合算されず、type別のフィールドにマッピングされる", () => {
      const nowUtcIso = "2026-01-05T03:00:00.000Z";
      const normalized: NormalizedDailyInsightsPoint[] = [
        point({ dayKey: "2026-01-05", type: InsightsMetricType.Success, value: 3 }),
        point({ dayKey: "2026-01-05", type: InsightsMetricType.Success, value: 4 }),
        point({ dayKey: "2026-01-05", type: InsightsMetricType.Failure, value: 2 }),
      ];

      const result = buildInsightsChartData(normalized, "7d", nowUtcIso);
      const datum = result.executionsData.find((d) => d.key === "2026-01-05")!;
      // 同キーで複数回渡された場合、buildInsightsChartData内部のdayMapで加算される
      expect(datum.success).toBe(7);
      expect(datum.failure).toBe(2);
    });

    it("isApproxがtrueの点が1つでもあればhasApproxPoints=trueになり、該当日のisApproxもtrueになる", () => {
      const nowUtcIso = "2026-01-05T03:00:00.000Z";
      const normalized: NormalizedDailyInsightsPoint[] = [
        point({ dayKey: "2026-01-03", type: InsightsMetricType.Success, value: 1, isApprox: true }),
        point({ dayKey: "2026-01-04", type: InsightsMetricType.Success, value: 2, isApprox: false }),
      ];

      const result = buildInsightsChartData(normalized, "7d", nowUtcIso);

      expect(result.hasApproxPoints).toBe(true);
      const approxDay = result.executionsData.find((d) => d.key === "2026-01-03")!;
      expect(approxDay.isApprox).toBe(true);
      const nonApproxDay = result.executionsData.find((d) => d.key === "2026-01-04")!;
      expect(nonApproxDay.isApprox).toBe(false);
    });

    it("type=0の点はisApproxの判定にも影響を与えない（呼び出し側での除外前提だが二重に無視される）", () => {
      const nowUtcIso = "2026-01-05T03:00:00.000Z";
      const normalized: NormalizedDailyInsightsPoint[] = [
        point({
          dayKey: "2026-01-04",
          type: InsightsMetricType.TimeSavedMin,
          value: 99,
          isApprox: true,
        }),
        point({ dayKey: "2026-01-04", type: InsightsMetricType.Success, value: 1, isApprox: false }),
      ];

      const result = buildInsightsChartData(normalized, "7d", nowUtcIso);

      expect(result.hasApproxPoints).toBe(false);
      const datum = result.executionsData.find((d) => d.key === "2026-01-04")!;
      expect(datum.isApprox).toBe(false);
      expect(datum.success).toBe(1);
    });

    it("range='all'の場合、軸の開始日は最古データ日になる（プリセット日数によるクランプをしない）", () => {
      const nowUtcIso = "2026-02-01T03:00:00.000Z";
      const normalized: NormalizedDailyInsightsPoint[] = [
        point({ dayKey: "2025-12-01", type: InsightsMetricType.Success, value: 1 }),
        point({ dayKey: "2026-01-15", type: InsightsMetricType.Success, value: 2 }),
      ];

      const result = buildInsightsChartData(normalized, "all", nowUtcIso);

      expect(result.executionsData[0].key).toBe("2025-12-01");
      expect(result.executionsData[result.executionsData.length - 1].key).toBe(
        result.todayDayKey,
      );
    });

    it("range='90d'の場合、軸の開始日はtoday-89日にクランプされる（最古データ日がさらに古くても切り詰められる）", () => {
      const nowUtcIso = "2026-04-01T03:00:00.000Z"; // JST 2026-04-01
      const normalized: NormalizedDailyInsightsPoint[] = [
        point({ dayKey: "2025-01-01", type: InsightsMetricType.Success, value: 1 }),
        point({ dayKey: "2026-03-31", type: InsightsMetricType.Success, value: 2 }),
      ];

      const result = buildInsightsChartData(normalized, "90d", nowUtcIso);

      // today(2026-04-01) - 89日 = 2026-01-02
      expect(result.executionsData[0].key).toBe("2026-01-02");
      expect(result.executionsData[0].key).not.toBe("2025-01-01");
    });

    it("lastDataDayKeyは正規化済みデータの最終日(dayKeys昇順の末尾)になる", () => {
      const nowUtcIso = "2026-01-10T03:00:00.000Z";
      const normalized: NormalizedDailyInsightsPoint[] = [
        point({ dayKey: "2026-01-06", type: InsightsMetricType.Success, value: 1 }),
        point({ dayKey: "2026-01-02", type: InsightsMetricType.Success, value: 1 }),
      ];

      const result = buildInsightsChartData(normalized, "7d", nowUtcIso);
      expect(result.lastDataDayKey).toBe("2026-01-06");
    });
  });
});
