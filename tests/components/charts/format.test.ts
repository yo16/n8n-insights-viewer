import {
  formatAxisTick,
  formatByUnit,
  formatBytes,
  formatCount,
  formatDurationMs,
  formatPercent,
  formatTooltipTime,
  toDayKeyFromUtc,
} from "@/components/charts/format";

describe("formatBytes", () => {
  it("1024未満はB表記のまま整数で表示する", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("1024以上1MB未満はKB表記（小数点なし）にする", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("2 KB"); // 1.5KB→四捨五入
    expect(formatBytes(1024 * 1024 - 1)).toBe("1024 KB");
  });

  it("1MB以上1GB未満はMB表記（小数点1桁）にする", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatBytes(1024 * 1024 * 1024 - 1)).toBe("1024.0 MB");
  });

  it("1GB以上はGB表記（小数点2桁）にする", () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.00 GB");
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe("2.50 GB");
  });

  it("負の値も絶対値で単位境界を判定しつつ符号を保持する", () => {
    expect(formatBytes(-2048)).toBe("-2 KB");
  });
});

describe("formatDurationMs", () => {
  it("1000ms未満はms表記のまま整数で表示する", () => {
    expect(formatDurationMs(0)).toBe("0ms");
    expect(formatDurationMs(999)).toBe("999ms");
  });

  it("1000ms以上60000ms未満は秒表記（小数点1桁）にする", () => {
    expect(formatDurationMs(1000)).toBe("1.0秒");
    expect(formatDurationMs(1500)).toBe("1.5秒");
    expect(formatDurationMs(59_999)).toBe("60.0秒");
  });

  it("60000ms以上は分表記（小数点1桁）にする", () => {
    expect(formatDurationMs(60_000)).toBe("1.0分");
    expect(formatDurationMs(90_000)).toBe("1.5分");
  });

  it("負の値も絶対値で単位境界を判定しつつ符号を保持する", () => {
    expect(formatDurationMs(-1500)).toBe("-1.5秒");
  });
});

describe("formatCount", () => {
  it("3桁区切りのカンマ表記にする", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(999)).toBe("999");
    expect(formatCount(1000)).toBe("1,000");
    expect(formatCount(1_234_567)).toBe("1,234,567");
  });
});

describe("formatPercent", () => {
  it("小数点1桁+%表記にする", () => {
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(12.34)).toBe("12.3%");
    expect(formatPercent(100)).toBe("100.0%");
  });
});

describe("formatByUnit", () => {
  it("null/undefinedは欠測として「-」を返す（ゼロ埋めしない）", () => {
    expect(formatByUnit(null)).toBe("-");
    expect(formatByUnit(undefined)).toBe("-");
    expect(formatByUnit(null, "bytes")).toBe("-");
    expect(formatByUnit(undefined, "ms")).toBe("-");
  });

  it("unit=bytesはformatBytesに委譲する", () => {
    expect(formatByUnit(2048, "bytes")).toBe("2 KB");
  });

  it("unit=msはformatDurationMsに委譲する", () => {
    expect(formatByUnit(1500, "ms")).toBe("1.5秒");
  });

  it("unit=percentはformatPercentに委譲する", () => {
    expect(formatByUnit(50, "percent")).toBe("50.0%");
  });

  it("unit=countはformatCountに委譲する", () => {
    expect(formatByUnit(1000, "count")).toBe("1,000");
  });

  it("unit=none、または省略時は数値を文字列化するだけにする", () => {
    expect(formatByUnit(42, "none")).toBe("42");
    expect(formatByUnit(42)).toBe("42");
  });

  it("0は欠測ではないため「-」にせず整形結果を返す", () => {
    expect(formatByUnit(0, "count")).toBe("0");
    expect(formatByUnit(0, "bytes")).toBe("0 B");
  });
});

describe("formatAxisTick", () => {
  it("日次キー（YYYY-MM-DD）はMM/DDに整形する（年は省略）", () => {
    expect(formatAxisTick("2026-07-10")).toBe("07/10");
    expect(formatAxisTick("2026-01-01")).toBe("01/01");
  });

  it("時間次キー（YYYY-MM-DDTHH）はMM/DD HH時に整形する", () => {
    expect(formatAxisTick("2026-07-10T05")).toBe("07/10 05時");
    expect(formatAxisTick("2026-07-10T23")).toBe("07/10 23時");
  });
});

describe("formatTooltipTime", () => {
  it("timestampUtcがある場合はJSTの日時（分まで）+(JST)を表示する", () => {
    // 2026-07-10T00:30:00Z → JST 09:30
    expect(formatTooltipTime("2026-07-10", "2026-07-10T00:30:00Z")).toBe(
      "2026-07-10 09:30 (JST)",
    );
  });

  it("timestampUtcが日跨ぎになる場合もJST日付側に丸めて表示する", () => {
    // 2026-07-10T20:00:00Z → JST 2026-07-11 05:00
    expect(formatTooltipTime("2026-07-10", "2026-07-10T20:00:00Z")).toBe(
      "2026-07-11 05:00 (JST)",
    );
  });

  it("timestampUtc省略時、時間次キー（YYYY-MM-DDTHH）はHH:00 (JST)に整形する", () => {
    expect(formatTooltipTime("2026-07-10T05")).toBe("2026-07-10 05:00 (JST)");
  });

  it("timestampUtc省略時、日次キー（YYYY-MM-DD）はそのまま(JST)を付けて表示する", () => {
    expect(formatTooltipTime("2026-07-10")).toBe("2026-07-10 (JST)");
  });
});

describe("toDayKeyFromUtc", () => {
  it("UTC時刻をJSTの日付キー（YYYY-MM-DD）に丸める", () => {
    // 2026-07-10T20:00:00Z → JST 2026-07-11
    expect(toDayKeyFromUtc("2026-07-10T20:00:00Z")).toBe("2026-07-11");
  });

  it("JST日付が変わらない時刻はそのままの日付キーになる", () => {
    // 2026-07-10T01:00:00Z → JST 10:00 (same day)
    expect(toDayKeyFromUtc("2026-07-10T01:00:00Z")).toBe("2026-07-10");
  });
});
