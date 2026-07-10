import {
  formatExecutionDateTime,
  formatExecutionDuration,
} from "../../../src/components/executions/format";

/**
 * src/components/executions/format.ts の単体テスト（画面4: JST日時・所要時間フォーマッタ）。
 */
describe("components/executions/format", () => {
  describe("formatExecutionDateTime", () => {
    it("UTCのISO8601日時をJST表示文字列へ変換する", () => {
      expect(formatExecutionDateTime("2026-07-10T12:00:00.000Z")).toBe(
        "2026-07-10 21:00",
      );
    });

    it("nullの場合は「—」を返す", () => {
      expect(formatExecutionDateTime(null)).toBe("—");
    });

    it("不正な日時文字列の場合は「—」を返す", () => {
      expect(formatExecutionDateTime("not-a-date")).toBe("—");
    });

    it("日付跨ぎ（UTC15:00→JST翌日0:00）を反映する", () => {
      expect(formatExecutionDateTime("2026-07-10T15:00:00.000Z")).toBe(
        "2026-07-11 00:00",
      );
    });
  });

  describe("formatExecutionDuration", () => {
    it("startedAtがnullの場合は「—」を返す", () => {
      expect(
        formatExecutionDuration(null, "2026-07-01T00:00:05.000Z"),
      ).toBe("—");
    });

    it("stoppedAtがnull（未終了）の場合は「—」を返す", () => {
      expect(
        formatExecutionDuration("2026-07-01T00:00:00.000Z", null),
      ).toBe("—");
    });

    it("両方nullの場合は「—」を返す", () => {
      expect(formatExecutionDuration(null, null)).toBe("—");
    });

    it("不正な日時文字列を含む場合は「—」を返す", () => {
      expect(
        formatExecutionDuration("not-a-date", "2026-07-01T00:00:05.000Z"),
      ).toBe("—");
    });

    it("stoppedAtがstartedAtより前（不整合データ）の場合は「—」を返す", () => {
      expect(
        formatExecutionDuration(
          "2026-07-01T00:00:05.000Z",
          "2026-07-01T00:00:00.000Z",
        ),
      ).toBe("—");
    });

    it("startedAtとstoppedAtが同一の場合は0msとして表示する", () => {
      expect(
        formatExecutionDuration(
          "2026-07-01T00:00:00.000Z",
          "2026-07-01T00:00:00.000Z",
        ),
      ).toBe("0ms");
    });

    it("1秒未満はミリ秒単位で表示する", () => {
      expect(
        formatExecutionDuration(
          "2026-07-01T00:00:00.000Z",
          "2026-07-01T00:00:00.500Z",
        ),
      ).toBe("500ms");
    });

    it("999msはミリ秒単位で表示する（境界値）", () => {
      expect(
        formatExecutionDuration(
          "2026-07-01T00:00:00.000Z",
          "2026-07-01T00:00:00.999Z",
        ),
      ).toBe("999ms");
    });

    it("1000msちょうどは秒単位で表示する（境界値）", () => {
      expect(
        formatExecutionDuration(
          "2026-07-01T00:00:00.000Z",
          "2026-07-01T00:00:01.000Z",
        ),
      ).toBe("1.0秒");
    });

    it("1秒以上60秒未満は小数第1位までの秒数で表示する", () => {
      expect(
        formatExecutionDuration(
          "2026-07-01T00:00:00.000Z",
          "2026-07-01T00:00:12.345Z",
        ),
      ).toBe("12.3秒");
    });

    it("59.9秒は秒単位で表示する（60秒未満の境界値）", () => {
      expect(
        formatExecutionDuration(
          "2026-07-01T00:00:00.000Z",
          "2026-07-01T00:00:59.900Z",
        ),
      ).toBe("59.9秒");
    });

    it("60秒ちょうどは分単位で表示する（境界値）", () => {
      expect(
        formatExecutionDuration(
          "2026-07-01T00:00:00.000Z",
          "2026-07-01T00:01:00.000Z",
        ),
      ).toBe("1分0秒");
    });

    it("60秒以上は分・秒で表示する", () => {
      expect(
        formatExecutionDuration(
          "2026-07-01T00:00:00.000Z",
          "2026-07-01T00:02:05.000Z",
        ),
      ).toBe("2分5秒");
    });

    it("1時間以上の場合も分・秒の表記が継続する", () => {
      expect(
        formatExecutionDuration(
          "2026-07-01T00:00:00.000Z",
          "2026-07-01T01:30:15.000Z",
        ),
      ).toBe("90分15秒");
    });
  });
});
