/**
 * src/app/sync/_lib/coverage.ts の単体テスト。
 *
 * 一時ファイルDBに `initializeDatabase` で本番同一のDDLを適用し、
 * insights_by_period / execution_entity にデータを入れてmin/maxの算出を検証する。
 * "server-only" を含むモジュールのため、jest.mock でno-opにしてimportを可能にする。
 */

jest.mock("server-only", () => ({}));

import { getCoverageRange } from "@/app/sync/_lib/coverage";
import { createTestDb } from "../../lib/db/testDbHelper";

describe("getCoverageRange", () => {
  let ctx: ReturnType<typeof createTestDb>;

  beforeEach(() => {
    ctx = createTestDb();
  });

  afterEach(() => {
    ctx.cleanup();
  });

  it("両テーブルが空の場合、min/maxともにnullを返す", () => {
    const result = getCoverageRange(ctx.db);

    expect(result.insights).toEqual({ min: null, max: null });
    expect(result.executions).toEqual({ min: null, max: null });
  });

  it("insights_by_periodにデータがある場合、periodStartの最古/最新を返す", () => {
    const insertStmt = ctx.db.prepare(
      `INSERT INTO insights_by_period (metaId, type, value, periodUnit, periodStart)
       VALUES (@metaId, @type, @value, @periodUnit, @periodStart)`,
    );
    insertStmt.run({
      metaId: 1,
      type: 0,
      value: 10,
      periodUnit: 0,
      periodStart: "2026-07-03T00:00:00.000Z",
    });
    insertStmt.run({
      metaId: 1,
      type: 0,
      value: 20,
      periodUnit: 0,
      periodStart: "2026-07-01T00:00:00.000Z",
    });
    insertStmt.run({
      metaId: 1,
      type: 0,
      value: 30,
      periodUnit: 0,
      periodStart: "2026-07-05T00:00:00.000Z",
    });

    const result = getCoverageRange(ctx.db);

    expect(result.insights).toEqual({
      min: "2026-07-01T00:00:00.000Z",
      max: "2026-07-05T00:00:00.000Z",
    });
  });

  it("execution_entityにデータがある場合、startedAtの最古/最新を返す", () => {
    const insertStmt = ctx.db.prepare(
      `INSERT INTO execution_entity (id, workflowId, status, mode, startedAt, stoppedAt, createdAt, finished, ingestedAt)
       VALUES (@id, @workflowId, @status, @mode, @startedAt, @stoppedAt, @createdAt, @finished, @ingestedAt)`,
    );
    insertStmt.run({
      id: 1,
      workflowId: "wf-1",
      status: "success",
      mode: "trigger",
      startedAt: "2026-06-30T00:00:00.000Z",
      stoppedAt: "2026-06-30T00:01:00.000Z",
      createdAt: "2026-06-30T00:00:00.000Z",
      finished: 1,
      ingestedAt: "2026-07-01T00:00:00.000Z",
    });
    insertStmt.run({
      id: 2,
      workflowId: "wf-1",
      status: "success",
      mode: "trigger",
      startedAt: "2026-07-04T00:00:00.000Z",
      stoppedAt: "2026-07-04T00:01:00.000Z",
      createdAt: "2026-07-04T00:00:00.000Z",
      finished: 1,
      ingestedAt: "2026-07-04T00:02:00.000Z",
    });

    const result = getCoverageRange(ctx.db);

    expect(result.executions).toEqual({
      min: "2026-06-30T00:00:00.000Z",
      max: "2026-07-04T00:00:00.000Z",
    });
  });

  it("insightsが空でexecutionsのみデータがある場合、それぞれ独立して結果を返す", () => {
    ctx.db
      .prepare(
        `INSERT INTO execution_entity (id, workflowId, status, mode, startedAt, stoppedAt, createdAt, finished, ingestedAt)
         VALUES (@id, @workflowId, @status, @mode, @startedAt, @stoppedAt, @createdAt, @finished, @ingestedAt)`,
      )
      .run({
        id: 1,
        workflowId: "wf-1",
        status: "success",
        mode: "trigger",
        startedAt: "2026-07-02T00:00:00.000Z",
        stoppedAt: "2026-07-02T00:01:00.000Z",
        createdAt: "2026-07-02T00:00:00.000Z",
        finished: 1,
        ingestedAt: "2026-07-02T00:02:00.000Z",
      });

    const result = getCoverageRange(ctx.db);

    expect(result.insights).toEqual({ min: null, max: null });
    expect(result.executions).toEqual({
      min: "2026-07-02T00:00:00.000Z",
      max: "2026-07-02T00:00:00.000Z",
    });
  });
});
