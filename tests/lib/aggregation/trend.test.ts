import { computeTrend } from "../../../src/lib/aggregation/trend";

describe("lib/aggregation/trend", () => {
  const TREND_SAMPLE_MIN = 4;

  describe("increasing/decreasing/flat判定", () => {
    it("単調増加する系列はincreasingになる", () => {
      const result = computeTrend([100, 200, 300, 400, 500], TREND_SAMPLE_MIN);
      expect(result.direction).toBe("increasing");
      expect(result.slope).toBeGreaterThan(0);
      expect(result.sampleCount).toBe(5);
      expect(result.isReference).toBe(false);
    });

    it("単調減少する系列はdecreasingになる", () => {
      const result = computeTrend([500, 400, 300, 200, 100], TREND_SAMPLE_MIN);
      expect(result.direction).toBe("decreasing");
      expect(result.slope).toBeLessThan(0);
      expect(result.sampleCount).toBe(5);
      expect(result.isReference).toBe(false);
    });

    it("完全に一定の系列はflatになる（傾き0）", () => {
      const result = computeTrend([100, 100, 100, 100, 100], TREND_SAMPLE_MIN);
      expect(result.direction).toBe("flat");
      expect(result.slope).toBe(0);
    });

    it("epsilon(相対1%)以内の微小変動はflatと判定される", () => {
      // 平均絶対値100 -> epsilon = 1.0。傾きが0.5程度になるよう極小変動を与える
      const samples = [100, 100.2, 99.8, 100.3, 99.7];
      const result = computeTrend(samples, TREND_SAMPLE_MIN);
      expect(result.direction).toBe("flat");
    });

    it("epsilonを超える変動はflatにならない（増加方向）", () => {
      // 平均絶対値100 -> epsilon = 1.0。傾きが確実にepsilonを超えるよう大きな増加を与える
      const samples = [80, 90, 100, 110, 120];
      const result = computeTrend(samples, TREND_SAMPLE_MIN);
      expect(result.direction).toBe("increasing");
    });
  });

  describe("欠測(null)の扱い", () => {
    it("null/undefinedを除外し、有効サンプルのみで傾きを算出する", () => {
      const result = computeTrend([100, null, 200, undefined, 300, 400], TREND_SAMPLE_MIN);
      expect(result.sampleCount).toBe(4);
      expect(result.direction).toBe("increasing");
    });

    it("有効サンプルが0件の場合はflatかつisReference:trueになる", () => {
      const result = computeTrend([null, null, undefined], TREND_SAMPLE_MIN);
      expect(result.direction).toBe("flat");
      expect(result.slope).toBe(0);
      expect(result.sampleCount).toBe(0);
      expect(result.isReference).toBe(true);
    });

    it("有効サンプルが1件のみの場合は傾き算出不能でflatかつisReference:trueになる", () => {
      const result = computeTrend([100, null, null], TREND_SAMPLE_MIN);
      expect(result.direction).toBe("flat");
      expect(result.sampleCount).toBe(1);
      expect(result.isReference).toBe(true);
    });
  });

  describe("trendSampleMinとisReference", () => {
    it("有効サンプル数がtrendSampleMin未満の場合はisReference:trueになる", () => {
      // trendSampleMin=4に対し有効サンプル3件
      const result = computeTrend([100, 200, 300], TREND_SAMPLE_MIN);
      expect(result.sampleCount).toBe(3);
      expect(result.isReference).toBe(true);
    });

    it("有効サンプル数がtrendSampleMinちょうどの場合はisReference:falseになる", () => {
      const result = computeTrend([100, 200, 300, 400], TREND_SAMPLE_MIN);
      expect(result.sampleCount).toBe(4);
      expect(result.isReference).toBe(false);
    });

    it("有効サンプル数がtrendSampleMinを超える場合はisReference:falseになる", () => {
      const result = computeTrend([100, 200, 300, 400, 500, 600], TREND_SAMPLE_MIN);
      expect(result.sampleCount).toBe(6);
      expect(result.isReference).toBe(false);
    });
  });

  describe("空配列", () => {
    it("空配列を入力した場合はflatかつisReference:trueになる", () => {
      const result = computeTrend([], TREND_SAMPLE_MIN);
      expect(result.direction).toBe("flat");
      expect(result.sampleCount).toBe(0);
      expect(result.isReference).toBe(true);
    });
  });
});
