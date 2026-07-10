import {
  formatCountDelta,
  formatDurationDelta,
  formatRateDeltaPt,
} from "@/components/dashboard/formatDelta";

describe("formatCountDelta", () => {
  it("正の差分は+記号と3桁区切り、割合を括弧内に表示する", () => {
    expect(formatCountDelta(1234, 0.083)).toBe("+1,234（+8.3%）");
  });

  it("負の差分は符号なし接頭辞（数値自体のマイナスのみ）で表示する", () => {
    expect(formatCountDelta(-12, -0.083)).toBe("-12（-8.3%）");
  });

  it("差分ゼロは±記号で表示する", () => {
    expect(formatCountDelta(0, 0)).toBe("±0（+0.0%）");
  });

  it("割合がnull（前期間ゼロ件で0除算回避）の場合は割合部分を表示しない", () => {
    expect(formatCountDelta(12, null)).toBe("+12");
  });

  it("負の割合は符号なしでマイナスを表示する", () => {
    expect(formatCountDelta(5, -0.5)).toBe("+5（-50.0%）");
  });
});

describe("formatDurationDelta", () => {
  it("1分以上は分単位で表示する（正の差分）", () => {
    expect(formatDurationDelta(90_000, 0.5)).toBe("+1.5分（+50.0%）");
  });

  it("1分以上は分単位で表示する（負の差分）", () => {
    expect(formatDurationDelta(-90_000, -0.5)).toBe("-1.5分（-50.0%）");
  });

  it("1秒以上60秒未満は秒単位で表示する", () => {
    expect(formatDurationDelta(1500, null)).toBe("+1.5秒");
  });

  it("1秒未満はms単位で表示する", () => {
    expect(formatDurationDelta(500, null)).toBe("+500ms");
  });

  it("差分ゼロは±記号のms表示になる", () => {
    expect(formatDurationDelta(0, 0)).toBe("±0ms（+0.0%）");
  });

  it("割合がnullの場合は括弧部分を表示しない", () => {
    expect(formatDurationDelta(2000, null)).toBe("+2.0秒");
  });
});

describe("formatRateDeltaPt", () => {
  it("nullの場合はundefinedを返す（比較なし）", () => {
    expect(formatRateDeltaPt(null)).toBeUndefined();
  });

  it("正の差分はptの前に+記号を付ける", () => {
    expect(formatRateDeltaPt(0.023)).toBe("+2.3pt");
  });

  it("負の差分は符号なし（数値のマイナスのみ）で表示する", () => {
    expect(formatRateDeltaPt(-0.023)).toBe("-2.3pt");
  });

  it("差分ゼロは±記号で表示する", () => {
    expect(formatRateDeltaPt(0)).toBe("±0.0pt");
  });
});
