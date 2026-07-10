import {
  buildDailyAxis,
  buildHourlyAxis,
  fillTimeline,
} from "../../../src/lib/aggregation/timeline";

describe("lib/aggregation/timeline", () => {
  describe("buildDailyAxis", () => {
    it("右端はnowUtcIsoが属するJST日付になる（JST日付跨ぎ: UTC 15:00 = JST翌日0:00）", () => {
      // nowUtcIso = 2026-01-05T15:00:00Z -> JST 2026-01-06 0:00
      const axis = buildDailyAxis("2026-01-03", "2026-01-05T15:00:00.000Z");
      expect(axis).toEqual(["2026-01-03", "2026-01-04", "2026-01-05", "2026-01-06"]);
      expect(axis[axis.length - 1]).toBe("2026-01-06");
    });

    it("nowUtcIsoがJST日付境界の直前(UTC 14:59:59)の場合は当日までになる", () => {
      const axis = buildDailyAxis("2026-01-03", "2026-01-05T14:59:59.000Z");
      expect(axis[axis.length - 1]).toBe("2026-01-05");
    });

    it("連続した日次キーを1日刻みで生成する（欠落なし）", () => {
      const axis = buildDailyAxis("2026-01-01", "2026-01-05T00:00:00.000Z");
      expect(axis).toEqual([
        "2026-01-01",
        "2026-01-02",
        "2026-01-03",
        "2026-01-04",
        "2026-01-05",
      ]);
    });

    it("since > untilの場合（範囲が逆転）は空配列を返す", () => {
      const axis = buildDailyAxis("2026-01-10", "2026-01-01T00:00:00.000Z");
      expect(axis).toEqual([]);
    });

    it("sinceとnowが同じJST日の場合は単一要素の配列を返す", () => {
      const axis = buildDailyAxis("2026-01-05", "2026-01-05T00:00:00.000Z");
      expect(axis).toEqual(["2026-01-05"]);
    });
  });

  describe("buildHourlyAxis", () => {
    it("右端はnowUtcIsoが属するJST時刻になる", () => {
      // nowUtcIso = 2026-01-05T05:30:00Z -> JST 14時台
      const axis = buildHourlyAxis("2026-01-05T10", "2026-01-05T05:30:00.000Z");
      expect(axis[axis.length - 1]).toBe("2026-01-05T14");
    });

    it("連続した時間キーを1時間刻みで生成する", () => {
      const axis = buildHourlyAxis("2026-01-01T22", "2026-01-02T01:00:00.000Z");
      // nowUtcIso 2026-01-02T01:00 UTC -> JST 2026-01-02T10
      expect(axis).toEqual([
        "2026-01-01T22",
        "2026-01-01T23",
        "2026-01-02T00",
        "2026-01-02T01",
        "2026-01-02T02",
        "2026-01-02T03",
        "2026-01-02T04",
        "2026-01-02T05",
        "2026-01-02T06",
        "2026-01-02T07",
        "2026-01-02T08",
        "2026-01-02T09",
        "2026-01-02T10",
      ]);
    });

    it("since > untilの場合（範囲が逆転）は空配列を返す", () => {
      const axis = buildHourlyAxis("2026-01-05T10", "2026-01-01T00:00:00.000Z");
      expect(axis).toEqual([]);
    });
  });

  describe("fillTimeline", () => {
    it("Mapに存在するキーは値で埋め、存在しないキーはnull（欠測）で埋める", () => {
      const axis = ["2026-01-01", "2026-01-02", "2026-01-03"];
      const values = new Map<string, number>([
        ["2026-01-01", 10],
        ["2026-01-03", 30],
      ]);
      const result = fillTimeline(axis, values);
      expect(result).toEqual([
        { key: "2026-01-01", value: 10 },
        { key: "2026-01-02", value: null },
        { key: "2026-01-03", value: 30 },
      ]);
    });

    it("欠測はnullで表現されゼロ埋めされない（0とnullを区別する）", () => {
      const axis = ["2026-01-01", "2026-01-02"];
      const values = new Map<string, number>([["2026-01-01", 0]]);
      const result = fillTimeline(axis, values);
      expect(result[0].value).toBe(0);
      expect(result[1].value).toBeNull();
    });

    it("空の軸に対しては空配列を返す", () => {
      expect(fillTimeline([], new Map())).toEqual([]);
    });

    it("Mapが空の場合は全区間がnull埋めになる", () => {
      const axis = ["2026-01-01", "2026-01-02"];
      const result = fillTimeline(axis, new Map());
      expect(result.every((p) => p.value === null)).toBe(true);
    });
  });
});
