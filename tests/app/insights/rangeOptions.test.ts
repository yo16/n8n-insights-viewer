import {
  DEFAULT_RANGE,
  RANGE_DAYS,
  RANGE_OPTIONS,
  parseRangeParam,
} from "../../../src/app/insights/rangeOptions";

/**
 * src/app/insights/rangeOptions.ts の単体テスト。
 * `parseRangeParam` の正常/不正値フォールバックと、定数の整合性を検証する。
 */
describe("app/insights/rangeOptions", () => {
  describe("parseRangeParam", () => {
    it.each(["7d", "30d", "90d", "all"] as const)(
      "正当な値 '%s' はそのまま返す",
      (value) => {
        expect(parseRangeParam(value)).toBe(value);
      },
    );

    it("未指定（undefined）の場合は既定値にフォールバックする", () => {
      expect(parseRangeParam(undefined)).toBe(DEFAULT_RANGE);
    });

    it("不正な文字列の場合は既定値にフォールバックする", () => {
      expect(parseRangeParam("invalid")).toBe(DEFAULT_RANGE);
    });

    it("空文字の場合は既定値にフォールバックする", () => {
      expect(parseRangeParam("")).toBe(DEFAULT_RANGE);
    });

    it("大文字小文字違いなど紛らわしい値も既定値にフォールバックする", () => {
      expect(parseRangeParam("7D")).toBe(DEFAULT_RANGE);
      expect(parseRangeParam("ALL")).toBe(DEFAULT_RANGE);
    });
  });

  it("RANGE_OPTIONSは4つのプリセットを持つ", () => {
    expect(RANGE_OPTIONS).toHaveLength(4);
    expect(RANGE_OPTIONS.map((o) => o.value)).toEqual(["7d", "30d", "90d", "all"]);
  });

  it("RANGE_DAYSは7d/30d/90dそれぞれの日数を持つ（allは含まない）", () => {
    expect(RANGE_DAYS).toEqual({ "7d": 7, "30d": 30, "90d": 90 });
  });
});
