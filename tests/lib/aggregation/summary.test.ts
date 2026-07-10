import { buildPeriodSummary } from "../../../src/lib/aggregation/summary";
import type { InsightsSummary } from "../../../src/lib/db/queries";

function summary(overrides: Partial<InsightsSummary> = {}): InsightsSummary {
  return {
    successCount: 80,
    failureCount: 20,
    totalRuntimeMs: 10000,
    totalExecutions: 100,
    successRate: 0.8,
    ...overrides,
  };
}

describe("lib/aggregation/summary", () => {
  describe("buildPeriodSummary: previous未指定", () => {
    it("previousを省略した場合はcomparison:nullで当期間の値のみ返す", () => {
      const current = summary();
      const result = buildPeriodSummary(current);
      expect(result.comparison).toBeNull();
      expect(result.totalExecutions).toBe(100);
      expect(result.successRate).toBe(0.8);
    });

    it("previousにnullを渡した場合もcomparison:nullになる", () => {
      const current = summary();
      const result = buildPeriodSummary(current, null);
      expect(result.comparison).toBeNull();
    });
  });

  describe("buildPeriodSummary: 前期間比の計算", () => {
    it("実行数・実行時間・失敗数の差分とパーセンテージが正しく計算される", () => {
      const current = summary({
        successCount: 90,
        failureCount: 10,
        totalRuntimeMs: 12000,
        totalExecutions: 100,
        successRate: 0.9,
      });
      const previous = summary({
        successCount: 80,
        failureCount: 20,
        totalRuntimeMs: 10000,
        totalExecutions: 100,
        successRate: 0.8,
      });
      const result = buildPeriodSummary(current, previous);
      expect(result.comparison).not.toBeNull();
      expect(result.comparison!.totalExecutionsDelta).toBe(0);
      expect(result.comparison!.totalExecutionsDeltaPct).toBe(0);
      expect(result.comparison!.totalRuntimeMsDelta).toBe(2000);
      expect(result.comparison!.totalRuntimeMsDeltaPct).toBeCloseTo(0.2);
      expect(result.comparison!.failureCountDelta).toBe(-10);
      expect(result.comparison!.successRateDelta).toBeCloseTo(0.1);
    });

    it("実行数が増加した場合は正のdeltaとdeltaPctになる", () => {
      const current = summary({ totalExecutions: 150 });
      const previous = summary({ totalExecutions: 100 });
      const result = buildPeriodSummary(current, previous);
      expect(result.comparison!.totalExecutionsDelta).toBe(50);
      expect(result.comparison!.totalExecutionsDeltaPct).toBeCloseTo(0.5);
    });

    it("実行数が減少した場合は負のdeltaとdeltaPctになる", () => {
      const current = summary({ totalExecutions: 50 });
      const previous = summary({ totalExecutions: 100 });
      const result = buildPeriodSummary(current, previous);
      expect(result.comparison!.totalExecutionsDelta).toBe(-50);
      expect(result.comparison!.totalExecutionsDeltaPct).toBeCloseTo(-0.5);
    });
  });

  describe("buildPeriodSummary: 0除算回避", () => {
    it("前期間の総実行数が0の場合、totalExecutionsDeltaPctはnullになる", () => {
      const current = summary({ totalExecutions: 100 });
      const previous = summary({ totalExecutions: 0 });
      const result = buildPeriodSummary(current, previous);
      expect(result.comparison!.totalExecutionsDelta).toBe(100);
      expect(result.comparison!.totalExecutionsDeltaPct).toBeNull();
    });

    it("前期間の総実行時間が0の場合、totalRuntimeMsDeltaPctはnullになる", () => {
      const current = summary({ totalRuntimeMs: 5000 });
      const previous = summary({ totalRuntimeMs: 0 });
      const result = buildPeriodSummary(current, previous);
      expect(result.comparison!.totalRuntimeMsDeltaPct).toBeNull();
    });

    it("現在・前期間ともに0件の場合もdeltaPctはnull（0/0を回避）", () => {
      const current = summary({ totalExecutions: 0, totalRuntimeMs: 0 });
      const previous = summary({ totalExecutions: 0, totalRuntimeMs: 0 });
      const result = buildPeriodSummary(current, previous);
      expect(result.comparison!.totalExecutionsDeltaPct).toBeNull();
      expect(result.comparison!.totalRuntimeMsDeltaPct).toBeNull();
    });
  });

  describe("buildPeriodSummary: successRateDeltaのnull伝播", () => {
    it("current/previousどちらかのsuccessRateがnullの場合、successRateDeltaはnull", () => {
      const current = summary({ totalExecutions: 0, successRate: null });
      const previous = summary({ totalExecutions: 100, successRate: 0.8 });
      const result = buildPeriodSummary(current, previous);
      expect(result.comparison!.successRateDelta).toBeNull();
    });

    it("current/previous両方のsuccessRateがnullの場合、successRateDeltaはnull", () => {
      const current = summary({ totalExecutions: 0, successRate: null });
      const previous = summary({ totalExecutions: 0, successRate: null });
      const result = buildPeriodSummary(current, previous);
      expect(result.comparison!.successRateDelta).toBeNull();
    });
  });
});
