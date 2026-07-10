import { sortWorkflowRows, withDerivedMetrics } from "@/components/workflows/sortWorkflows";
import type { WorkflowSummaryRow } from "@/lib/db/queries/workflows";
import type { SortKey, WorkflowSummaryRowWithDerived } from "@/components/workflows/types";

function makeRow(overrides: Partial<WorkflowSummaryRow> = {}): WorkflowSummaryRow {
  return {
    workflowId: "wf-1",
    name: "workflow",
    active: 1,
    successCount: 0,
    failureCount: 0,
    totalRuntimeMs: 0,
    executionCount: 0,
    statisticsTotalCount: 0,
    ...overrides,
  };
}

describe("withDerivedMetrics", () => {
  it("executionCountが0より大きい場合、成功率と平均実行時間を算出する", () => {
    const rows = [
      makeRow({
        workflowId: "wf-1",
        successCount: 8,
        failureCount: 2,
        executionCount: 10,
        totalRuntimeMs: 5000,
      }),
    ];

    const [result] = withDerivedMetrics(rows);

    expect(result.successRate).toBe(80);
    expect(result.avgRuntimeMs).toBe(500);
  });

  it("executionCountが0の場合、成功率と平均実行時間はnullになる", () => {
    const rows = [
      makeRow({
        workflowId: "wf-2",
        successCount: 0,
        failureCount: 0,
        executionCount: 0,
        totalRuntimeMs: 0,
      }),
    ];

    const [result] = withDerivedMetrics(rows);

    expect(result.successRate).toBeNull();
    expect(result.avgRuntimeMs).toBeNull();
  });

  it("元の行のプロパティを保持したまま派生指標を付与する", () => {
    const rows = [
      makeRow({
        workflowId: "wf-3",
        name: "keep-props",
        active: 0,
        statisticsTotalCount: 42,
      }),
    ];

    const [result] = withDerivedMetrics(rows);

    expect(result.workflowId).toBe("wf-3");
    expect(result.name).toBe("keep-props");
    expect(result.active).toBe(0);
    expect(result.statisticsTotalCount).toBe(42);
  });

  it("複数行それぞれに独立して派生指標を算出する", () => {
    const rows = [
      makeRow({ workflowId: "wf-1", successCount: 5, failureCount: 5, executionCount: 10 }),
      makeRow({ workflowId: "wf-2", successCount: 0, failureCount: 0, executionCount: 0 }),
    ];

    const result = withDerivedMetrics(rows);

    expect(result[0].successRate).toBe(50);
    expect(result[1].successRate).toBeNull();
  });

  it("元の配列を変更しない（非破壊）", () => {
    const rows = [makeRow({ executionCount: 10, successCount: 5, failureCount: 5 })];
    const rowsCopy = JSON.parse(JSON.stringify(rows));

    withDerivedMetrics(rows);

    expect(rows).toEqual(rowsCopy);
  });
});

describe("sortWorkflowRows", () => {
  function makeDerivedRow(
    overrides: Partial<WorkflowSummaryRowWithDerived> = {},
  ): WorkflowSummaryRowWithDerived {
    return {
      workflowId: "wf-1",
      name: "workflow",
      active: 1,
      successCount: 0,
      failureCount: 0,
      totalRuntimeMs: 0,
      executionCount: 0,
      statisticsTotalCount: 0,
      successRate: null,
      avgRuntimeMs: null,
      ...overrides,
    };
  }

  it("元の配列を変更しない（非破壊）", () => {
    const rows = [
      makeDerivedRow({ workflowId: "b", name: "b" }),
      makeDerivedRow({ workflowId: "a", name: "a" }),
    ];
    const original = [...rows];

    sortWorkflowRows(rows, "name", "asc");

    expect(rows).toEqual(original);
  });

  describe("name（文字列）ソート", () => {
    it("昇順にソートする", () => {
      const rows = [
        makeDerivedRow({ workflowId: "1", name: "charlie" }),
        makeDerivedRow({ workflowId: "2", name: "alpha" }),
        makeDerivedRow({ workflowId: "3", name: "bravo" }),
      ];

      const sorted = sortWorkflowRows(rows, "name", "asc");

      expect(sorted.map((r) => r.name)).toEqual(["alpha", "bravo", "charlie"]);
    });

    it("降順にソートする", () => {
      const rows = [
        makeDerivedRow({ workflowId: "1", name: "charlie" }),
        makeDerivedRow({ workflowId: "2", name: "alpha" }),
        makeDerivedRow({ workflowId: "3", name: "bravo" }),
      ];

      const sorted = sortWorkflowRows(rows, "name", "desc");

      expect(sorted.map((r) => r.name)).toEqual(["charlie", "bravo", "alpha"]);
    });
  });

  describe("active（数値0/1）ソート", () => {
    it("昇順（非アクティブ→アクティブ）にソートする", () => {
      const rows = [
        makeDerivedRow({ workflowId: "1", active: 1 }),
        makeDerivedRow({ workflowId: "2", active: 0 }),
      ];

      const sorted = sortWorkflowRows(rows, "active", "asc");

      expect(sorted.map((r) => r.workflowId)).toEqual(["2", "1"]);
    });

    it("降順（アクティブ→非アクティブ）にソートする", () => {
      const rows = [
        makeDerivedRow({ workflowId: "1", active: 0 }),
        makeDerivedRow({ workflowId: "2", active: 1 }),
      ];

      const sorted = sortWorkflowRows(rows, "active", "desc");

      expect(sorted.map((r) => r.workflowId)).toEqual(["2", "1"]);
    });
  });

  describe("executionCount ソート", () => {
    it("昇順にソートする", () => {
      const rows = [
        makeDerivedRow({ workflowId: "1", executionCount: 30 }),
        makeDerivedRow({ workflowId: "2", executionCount: 10 }),
        makeDerivedRow({ workflowId: "3", executionCount: 20 }),
      ];

      const sorted = sortWorkflowRows(rows, "executionCount", "asc");

      expect(sorted.map((r) => r.workflowId)).toEqual(["2", "3", "1"]);
    });

    it("降順にソートする", () => {
      const rows = [
        makeDerivedRow({ workflowId: "1", executionCount: 30 }),
        makeDerivedRow({ workflowId: "2", executionCount: 10 }),
        makeDerivedRow({ workflowId: "3", executionCount: 20 }),
      ];

      const sorted = sortWorkflowRows(rows, "executionCount", "desc");

      expect(sorted.map((r) => r.workflowId)).toEqual(["1", "3", "2"]);
    });
  });

  describe("totalRuntimeMs ソート", () => {
    it("昇順にソートする", () => {
      const rows = [
        makeDerivedRow({ workflowId: "1", totalRuntimeMs: 300 }),
        makeDerivedRow({ workflowId: "2", totalRuntimeMs: 100 }),
      ];

      const sorted = sortWorkflowRows(rows, "totalRuntimeMs", "asc");

      expect(sorted.map((r) => r.workflowId)).toEqual(["2", "1"]);
    });

    it("降順にソートする", () => {
      const rows = [
        makeDerivedRow({ workflowId: "1", totalRuntimeMs: 300 }),
        makeDerivedRow({ workflowId: "2", totalRuntimeMs: 100 }),
      ];

      const sorted = sortWorkflowRows(rows, "totalRuntimeMs", "desc");

      expect(sorted.map((r) => r.workflowId)).toEqual(["1", "2"]);
    });
  });

  describe("statisticsTotalCount ソート", () => {
    it("昇順にソートする", () => {
      const rows = [
        makeDerivedRow({ workflowId: "1", statisticsTotalCount: 500 }),
        makeDerivedRow({ workflowId: "2", statisticsTotalCount: 5 }),
      ];

      const sorted = sortWorkflowRows(rows, "statisticsTotalCount", "asc");

      expect(sorted.map((r) => r.workflowId)).toEqual(["2", "1"]);
    });

    it("降順にソートする", () => {
      const rows = [
        makeDerivedRow({ workflowId: "1", statisticsTotalCount: 500 }),
        makeDerivedRow({ workflowId: "2", statisticsTotalCount: 5 }),
      ];

      const sorted = sortWorkflowRows(rows, "statisticsTotalCount", "desc");

      expect(sorted.map((r) => r.workflowId)).toEqual(["1", "2"]);
    });
  });

  describe("successRate ソート（null=実行0件の末尾固定）", () => {
    const rows = [
      makeDerivedRow({ workflowId: "no-exec", executionCount: 0, successRate: null }),
      makeDerivedRow({ workflowId: "low", executionCount: 10, successRate: 40 }),
      makeDerivedRow({ workflowId: "high", executionCount: 10, successRate: 90 }),
    ];

    it("昇順でもnullは末尾に固定される", () => {
      const sorted = sortWorkflowRows(rows, "successRate", "asc");

      expect(sorted.map((r) => r.workflowId)).toEqual(["low", "high", "no-exec"]);
    });

    it("降順でもnullは末尾に固定される", () => {
      const sorted = sortWorkflowRows(rows, "successRate", "desc");

      expect(sorted.map((r) => r.workflowId)).toEqual(["high", "low", "no-exec"]);
    });

    it("すべての行がnullの場合、順序が変わらない（安定性は問わないが例外を投げない）", () => {
      const allNullRows = [
        makeDerivedRow({ workflowId: "a", successRate: null }),
        makeDerivedRow({ workflowId: "b", successRate: null }),
      ];

      const sorted = sortWorkflowRows(allNullRows, "successRate", "asc");

      expect(sorted).toHaveLength(2);
    });
  });

  describe("avgRuntimeMs ソート（null=実行0件の末尾固定）", () => {
    const rows = [
      makeDerivedRow({ workflowId: "no-exec", executionCount: 0, avgRuntimeMs: null }),
      makeDerivedRow({ workflowId: "fast", executionCount: 10, avgRuntimeMs: 100 }),
      makeDerivedRow({ workflowId: "slow", executionCount: 10, avgRuntimeMs: 900 }),
    ];

    it("昇順でもnullは末尾に固定される", () => {
      const sorted = sortWorkflowRows(rows, "avgRuntimeMs", "asc");

      expect(sorted.map((r) => r.workflowId)).toEqual(["fast", "slow", "no-exec"]);
    });

    it("降順でもnullは末尾に固定される", () => {
      const sorted = sortWorkflowRows(rows, "avgRuntimeMs", "desc");

      expect(sorted.map((r) => r.workflowId)).toEqual(["slow", "fast", "no-exec"]);
    });
  });

  it("未知のソートキーが渡された場合でも例外を投げず、順序を変えない扱いになる", () => {
    const rows = [
      makeDerivedRow({ workflowId: "1" }),
      makeDerivedRow({ workflowId: "2" }),
    ];

    const sorted = sortWorkflowRows(rows, "unknown" as SortKey, "asc");

    expect(sorted).toHaveLength(2);
  });
});
