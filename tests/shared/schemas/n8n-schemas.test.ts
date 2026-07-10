import { InsightsByPeriodRowSchema } from "../../../src/shared/schemas/insightsByPeriod";
import { InsightsMetadataRowSchema } from "../../../src/shared/schemas/insightsMetadata";
import { WorkflowEntityRowSchema } from "../../../src/shared/schemas/workflowEntity";
import { WorkflowStatisticsRowSchema } from "../../../src/shared/schemas/workflowStatistics";
import { ExecutionEntityRowSchema } from "../../../src/shared/schemas/executionEntity";

describe("InsightsByPeriodRowSchema", () => {
  it("正常な行を受理する", () => {
    const result = InsightsByPeriodRowSchema.safeParse({
      metaId: 1,
      type: 2,
      value: 42,
      periodUnit: 1,
      periodStart: "2026-07-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("typeが範囲外(4)なら拒否する", () => {
    const result = InsightsByPeriodRowSchema.safeParse({
      metaId: 1,
      type: 4,
      value: 42,
      periodUnit: 1,
      periodStart: "2026-07-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("periodUnitが範囲外(3)なら拒否する", () => {
    const result = InsightsByPeriodRowSchema.safeParse({
      metaId: 1,
      type: 2,
      value: 42,
      periodUnit: 3,
      periodStart: "2026-07-01T00:00:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("periodStartが欠落していれば拒否する", () => {
    const result = InsightsByPeriodRowSchema.safeParse({
      metaId: 1,
      type: 2,
      value: 42,
      periodUnit: 1,
    });
    expect(result.success).toBe(false);
  });
});

describe("InsightsMetadataRowSchema", () => {
  it("workflowId/workflowName/projectNameがnullでも受理する（削除後の状態）", () => {
    const result = InsightsMetadataRowSchema.safeParse({
      metaId: 5,
      workflowId: null,
      workflowName: "旧ワークフロー",
      projectName: null,
    });
    expect(result.success).toBe(true);
  });

  it("metaIdが文字列なら拒否する", () => {
    const result = InsightsMetadataRowSchema.safeParse({
      metaId: "5",
      workflowId: null,
      workflowName: null,
      projectName: null,
    });
    expect(result.success).toBe(false);
  });

  it("必須キー(workflowName)が欠落していれば拒否する", () => {
    const result = InsightsMetadataRowSchema.safeParse({
      metaId: 5,
      workflowId: null,
      projectName: null,
    });
    expect(result.success).toBe(false);
  });

  it("projectNameが数値なら拒否する", () => {
    const result = InsightsMetadataRowSchema.safeParse({
      metaId: 5,
      workflowId: null,
      workflowName: null,
      projectName: 123,
    });
    expect(result.success).toBe(false);
  });
});

describe("WorkflowEntityRowSchema", () => {
  it("正常な行を受理する", () => {
    const result = WorkflowEntityRowSchema.safeParse({
      id: "wf-1",
      name: "sample",
      active: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: null,
    });
    expect(result.success).toBe(true);
  });

  it("activeが0/1以外なら拒否する", () => {
    const result = WorkflowEntityRowSchema.safeParse({
      id: "wf-1",
      name: "sample",
      active: 2,
      createdAt: null,
      updatedAt: null,
    });
    expect(result.success).toBe(false);
  });

  it("idが空文字なら拒否する", () => {
    const result = WorkflowEntityRowSchema.safeParse({
      id: "",
      name: "sample",
      active: 0,
      createdAt: null,
      updatedAt: null,
    });
    expect(result.success).toBe(false);
  });

  it("必須キー(name)が欠落していれば拒否する", () => {
    const result = WorkflowEntityRowSchema.safeParse({
      id: "wf-1",
      active: 0,
      createdAt: null,
      updatedAt: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("WorkflowStatisticsRowSchema", () => {
  it("正常な行を受理する", () => {
    const result = WorkflowStatisticsRowSchema.safeParse({
      workflowId: "wf-1",
      name: "production_success",
      count: 10,
      latestEvent: "2026-07-01T00:00:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("countが数値でなければ拒否する", () => {
    const result = WorkflowStatisticsRowSchema.safeParse({
      workflowId: "wf-1",
      name: "production_success",
      count: "10",
      latestEvent: null,
    });
    expect(result.success).toBe(false);
  });

  it("workflowIdが空文字なら拒否する", () => {
    const result = WorkflowStatisticsRowSchema.safeParse({
      workflowId: "",
      name: "production_success",
      count: 10,
      latestEvent: null,
    });
    expect(result.success).toBe(false);
  });

  it("nameが空文字なら拒否する", () => {
    const result = WorkflowStatisticsRowSchema.safeParse({
      workflowId: "wf-1",
      name: "",
      count: 10,
      latestEvent: null,
    });
    expect(result.success).toBe(false);
  });

  it("workflowIdキーが欠落していれば拒否する", () => {
    const result = WorkflowStatisticsRowSchema.safeParse({
      name: "production_success",
      count: 10,
      latestEvent: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("ExecutionEntityRowSchema", () => {
  it("正常な行を受理する", () => {
    const result = ExecutionEntityRowSchema.safeParse({
      id: 100,
      workflowId: "wf-1",
      status: "success",
      mode: "trigger",
      startedAt: "2026-07-01T00:00:00.000Z",
      stoppedAt: "2026-07-01T00:01:00.000Z",
      createdAt: "2026-07-01T00:00:00.000Z",
      finished: 1,
      ingestedAt: "2026-07-01T00:05:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("ingestedAtが欠落していれば拒否する（同期時に必ず付与される想定）", () => {
    const result = ExecutionEntityRowSchema.safeParse({
      id: 100,
      workflowId: "wf-1",
      status: "success",
      mode: "trigger",
      startedAt: null,
      stoppedAt: null,
      createdAt: null,
      finished: null,
    });
    expect(result.success).toBe(false);
  });

  it("nullable項目はnullを受理する", () => {
    const result = ExecutionEntityRowSchema.safeParse({
      id: 101,
      workflowId: null,
      status: null,
      mode: null,
      startedAt: null,
      stoppedAt: null,
      createdAt: null,
      finished: null,
      ingestedAt: "2026-07-01T00:05:00.000Z",
    });
    expect(result.success).toBe(true);
  });

  it("ingestedAtが空文字なら拒否する", () => {
    const result = ExecutionEntityRowSchema.safeParse({
      id: 100,
      workflowId: "wf-1",
      status: "success",
      mode: "trigger",
      startedAt: null,
      stoppedAt: null,
      createdAt: null,
      finished: null,
      ingestedAt: "",
    });
    expect(result.success).toBe(false);
  });

  it("idが文字列なら拒否する（型違反）", () => {
    const result = ExecutionEntityRowSchema.safeParse({
      id: "100",
      workflowId: "wf-1",
      status: "success",
      mode: "trigger",
      startedAt: null,
      stoppedAt: null,
      createdAt: null,
      finished: null,
      ingestedAt: "2026-07-01T00:05:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("finishedが0/1/null以外(true)なら拒否する（型違反）", () => {
    const result = ExecutionEntityRowSchema.safeParse({
      id: 100,
      workflowId: "wf-1",
      status: "success",
      mode: "trigger",
      startedAt: null,
      stoppedAt: null,
      createdAt: null,
      finished: true,
      ingestedAt: "2026-07-01T00:05:00.000Z",
    });
    expect(result.success).toBe(false);
  });

  it("finishedが2など0/1以外の数値なら拒否する（型違反）", () => {
    const result = ExecutionEntityRowSchema.safeParse({
      id: 100,
      workflowId: "wf-1",
      status: "success",
      mode: "trigger",
      startedAt: null,
      stoppedAt: null,
      createdAt: null,
      finished: 2,
      ingestedAt: "2026-07-01T00:05:00.000Z",
    });
    expect(result.success).toBe(false);
  });
});
