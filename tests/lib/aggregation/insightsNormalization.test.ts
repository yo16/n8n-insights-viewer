import {
  normalizeInsightsToDaily,
  type NormalizableInsightsRow,
} from "../../../src/lib/aggregation/insightsNormalization";
import { InsightsMetricType, InsightsPeriodUnit } from "../../../src/shared/types";

function hourRow(overrides: Partial<NormalizableInsightsRow>): NormalizableInsightsRow {
  return {
    periodStart: "2026-01-01T00:00:00.000Z",
    periodUnit: InsightsPeriodUnit.Hour,
    type: InsightsMetricType.Success,
    value: 1,
    workflowId: null,
    workflowName: null,
    ...overrides,
  };
}

describe("lib/aggregation/insightsNormalization", () => {
  describe("hour粒度のJST日次境界", () => {
    it("UTC 15:00(=JST翌日0:00)はJSTの翌日として集計される", () => {
      const rows: NormalizableInsightsRow[] = [
        hourRow({ periodStart: "2026-01-01T15:00:00.000Z", value: 10 }),
      ];
      const result = normalizeInsightsToDaily(rows);
      expect(result).toHaveLength(1);
      expect(result[0].dayKey).toBe("2026-01-02");
      expect(result[0].isApprox).toBe(false);
      expect(result[0].value).toBe(10);
    });

    it("UTC 14:59:59(=JST同日23:59:59)はJSTの当日として集計される", () => {
      const rows: NormalizableInsightsRow[] = [
        hourRow({ periodStart: "2026-01-01T14:59:59.000Z", value: 5 }),
      ];
      const result = normalizeInsightsToDaily(rows);
      expect(result).toHaveLength(1);
      expect(result[0].dayKey).toBe("2026-01-01");
      expect(result[0].isApprox).toBe(false);
    });

    it("境界をまたぐ2件のhour行はそれぞれ別のJST日にバケット分けされ合算されない", () => {
      const rows: NormalizableInsightsRow[] = [
        hourRow({ periodStart: "2026-01-01T14:00:00.000Z", value: 3 }), // JST 23時 = 1/1
        hourRow({ periodStart: "2026-01-01T15:00:00.000Z", value: 7 }), // JST 0時 = 1/2
      ];
      const result = normalizeInsightsToDaily(rows);
      expect(result).toEqual([
        expect.objectContaining({ dayKey: "2026-01-01", value: 3 }),
        expect.objectContaining({ dayKey: "2026-01-02", value: 7 }),
      ]);
    });

    it("同一JST日に属する複数のhour行は合算される", () => {
      const rows: NormalizableInsightsRow[] = [
        hourRow({ periodStart: "2026-01-01T15:00:00.000Z", value: 4 }), // JST 1/2 0時
        hourRow({ periodStart: "2026-01-01T20:00:00.000Z", value: 6 }), // JST 1/2 5時
      ];
      const result = normalizeInsightsToDaily(rows);
      expect(result).toHaveLength(1);
      expect(result[0].dayKey).toBe("2026-01-02");
      expect(result[0].value).toBe(10);
    });
  });

  describe("day/weekのisApproxフラグ", () => {
    it("day粒度はUTC日付をキーにしてisApprox: trueになる", () => {
      const rows: NormalizableInsightsRow[] = [
        hourRow({
          periodStart: "2026-01-01T15:00:00.000Z",
          periodUnit: InsightsPeriodUnit.Day,
          value: 20,
        }),
      ];
      const result = normalizeInsightsToDaily(rows);
      expect(result).toHaveLength(1);
      // dayの場合はUTC基準のためJST変換されない: 2026-01-01のまま
      expect(result[0].dayKey).toBe("2026-01-01");
      expect(result[0].isApprox).toBe(true);
    });

    it("week粒度もUTC日付をキーにしてisApprox: trueになる（週内分解はしない）", () => {
      const rows: NormalizableInsightsRow[] = [
        hourRow({
          periodStart: "2026-01-05T00:00:00.000Z",
          periodUnit: InsightsPeriodUnit.Week,
          value: 70,
        }),
      ];
      const result = normalizeInsightsToDaily(rows);
      expect(result).toHaveLength(1);
      expect(result[0].dayKey).toBe("2026-01-05");
      expect(result[0].isApprox).toBe(true);
    });
  });

  describe("粒度混在入力の合算", () => {
    it("同一UTC日付でもhour(isApprox:false)とday(isApprox:true)は別バケットとして扱われる", () => {
      const rows: NormalizableInsightsRow[] = [
        hourRow({
          periodStart: "2026-01-01T01:00:00.000Z", // JST同日 1/1 10時 -> dayKey 2026-01-01, isApprox false
          periodUnit: InsightsPeriodUnit.Hour,
          value: 1,
        }),
        hourRow({
          periodStart: "2026-01-01T01:00:00.000Z", // UTC日付そのまま 2026-01-01, isApprox true
          periodUnit: InsightsPeriodUnit.Day,
          value: 2,
        }),
      ];
      const result = normalizeInsightsToDaily(rows);
      expect(result).toHaveLength(2);
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ dayKey: "2026-01-01", isApprox: false, value: 1 }),
          expect.objectContaining({ dayKey: "2026-01-01", isApprox: true, value: 2 }),
        ]),
      );
    });

    it("type・workflowIdが異なる行は別バケットとして扱われる", () => {
      const rows: NormalizableInsightsRow[] = [
        hourRow({ type: InsightsMetricType.Success, workflowId: "wf-1", value: 1 }),
        hourRow({ type: InsightsMetricType.Failure, workflowId: "wf-1", value: 2 }),
        hourRow({ type: InsightsMetricType.Success, workflowId: "wf-2", value: 3 }),
        hourRow({ type: InsightsMetricType.Success, workflowId: "wf-1", value: 4 }),
      ];
      const result = normalizeInsightsToDaily(rows);
      expect(result).toHaveLength(3);
      const wf1Success = result.find(
        (r) => r.workflowId === "wf-1" && r.type === InsightsMetricType.Success,
      );
      expect(wf1Success?.value).toBe(5); // 1 + 4が合算される
    });

    it("結果はdayKeyの昇順でソートされる", () => {
      const rows: NormalizableInsightsRow[] = [
        hourRow({ periodStart: "2026-01-03T00:00:00.000Z", value: 1 }),
        hourRow({ periodStart: "2026-01-01T00:00:00.000Z", value: 1 }),
        hourRow({ periodStart: "2026-01-02T00:00:00.000Z", value: 1 }),
      ];
      const result = normalizeInsightsToDaily(rows);
      expect(result.map((r) => r.dayKey)).toEqual(["2026-01-01", "2026-01-02", "2026-01-03"]);
    });

    it("空配列を入力した場合は空配列を返す", () => {
      expect(normalizeInsightsToDaily([])).toEqual([]);
    });
  });
});
