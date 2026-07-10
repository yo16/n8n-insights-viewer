import {
  JST_OFFSET_MS,
  utcToJst,
  jstDayKey,
  jstHourKey,
  formatJstDate,
  formatJstDateTime,
  isSameJstDay,
} from "../../../src/shared/datetime/jst";

describe("shared/datetime/jst", () => {
  it("JST_OFFSET_MSは+9時間である", () => {
    expect(JST_OFFSET_MS).toBe(9 * 60 * 60 * 1000);
  });

  describe("utcToJst", () => {
    it("UTC正午をJST 21時へ変換する", () => {
      const parts = utcToJst("2026-07-10T12:00:00.000Z");
      expect(parts).toEqual({
        year: 2026,
        month: 7,
        day: 10,
        hour: 21,
        minute: 0,
        second: 0,
        millisecond: 0,
      });
    });

    it("不正な日時文字列はエラーを投げる", () => {
      expect(() => utcToJst("not-a-date")).toThrow();
    });
  });

  describe("日付跨ぎの境界（UTC→JST）", () => {
    it("UTC 14:59はJSTでは同日23:59になる（日付は変わらない）", () => {
      expect(jstDayKey("2026-07-10T14:59:00.000Z")).toBe("2026-07-10");
    });

    it("UTC 15:00はJSTでは翌日0:00になる（日付が変わる境界）", () => {
      expect(jstDayKey("2026-07-10T15:00:00.000Z")).toBe("2026-07-11");
    });
  });

  describe("月末・年末の跨ぎ", () => {
    it("月末UTC15:00は翌月1日のJST日付になる", () => {
      expect(jstDayKey("2026-06-30T15:00:00.000Z")).toBe("2026-07-01");
    });

    it("年末UTC15:00は翌年1/1のJST日付になる", () => {
      expect(jstDayKey("2026-12-31T15:00:00.000Z")).toBe("2027-01-01");
    });

    it("年末UTC14:59はまだ同年12/31のJST日付である", () => {
      expect(jstDayKey("2026-12-31T14:59:00.000Z")).toBe("2026-12-31");
    });
  });

  describe("jstHourKey", () => {
    it("時間キーはYYYY-MM-DDTHH形式で日付跨ぎも反映する", () => {
      expect(jstHourKey("2026-07-10T15:30:00.000Z")).toBe("2026-07-11T00");
    });

    it("同一時内はゼロ埋めされたHHで返る", () => {
      expect(jstHourKey("2026-07-10T00:05:00.000Z")).toBe("2026-07-10T09");
    });
  });

  describe("フォーマッタ", () => {
    it("formatJstDateはYYYY-MM-DD形式", () => {
      expect(formatJstDate("2026-01-01T00:00:00.000Z")).toBe("2026-01-01");
    });

    it("formatJstDateTimeはYYYY-MM-DD HH:mm形式でゼロ埋めする", () => {
      expect(formatJstDateTime("2026-01-01T00:05:00.000Z")).toBe("2026-01-01 09:05");
    });
  });

  describe("isSameJstDay", () => {
    it("JSTで同日になる2つのUTC日時はtrueを返す", () => {
      expect(
        isSameJstDay("2026-07-10T00:00:00.000Z", "2026-07-10T14:59:59.000Z"),
      ).toBe(true);
    });

    it("JSTで日付が変わる境界を跨ぐ2つのUTC日時はfalseを返す", () => {
      expect(
        isSameJstDay("2026-07-10T14:59:59.000Z", "2026-07-10T15:00:00.000Z"),
      ).toBe(false);
    });
  });
});
