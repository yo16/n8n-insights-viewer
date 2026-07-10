import Database from "better-sqlite3";

import { createTestDb } from "../testDbHelper";
import { getWorkflowSummaries } from "../../../../src/lib/db/queries/workflows";

/**
 * src/lib/db/queries/workflows.ts の単体テスト
 * (docs/design/api-design.md §6, docs/design/frontend-design.md 画面3)
 */
describe("queries/workflows", () => {
  let db: Database.Database;
  let cleanup: () => void;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());

    db.prepare(
      "INSERT INTO workflow_entity (id, name, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)",
    ).run("wf-1", "Active Workflow", 1, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");
    db.prepare(
      "INSERT INTO workflow_entity (id, name, active, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)",
    ).run("wf-2", "Inactive Workflow", 0, "2026-01-01T00:00:00.000Z", "2026-01-01T00:00:00.000Z");

    db.prepare(
      "INSERT INTO insights_metadata (metaId, workflowId, workflowName, projectName) VALUES (?, ?, ?, ?)",
    ).run(1, "wf-1", "Active Workflow", "Default");

    const insertInsight = db.prepare(
      "INSERT INTO insights_by_period (metaId, type, value, periodUnit, periodStart) VALUES (?, ?, ?, ?, ?)",
    );
    insertInsight.run(1, 2, 30, 1, "2026-07-01T00:00:00.000Z");
    insertInsight.run(1, 3, 10, 1, "2026-07-01T00:00:00.000Z");
    insertInsight.run(1, 1, 5000, 1, "2026-07-01T00:00:00.000Z");

    const insertStat = db.prepare(
      "INSERT INTO workflow_statistics (workflowId, name, count, latestEvent) VALUES (?, ?, ?, ?)",
    );
    insertStat.run("wf-1", "production_success", 100, "2026-07-01T00:00:00.000Z");
    insertStat.run("wf-1", "production_error", 5, "2026-07-01T00:00:00.000Z");
  });

  afterEach(() => {
    cleanup();
  });

  it("全ワークフローを集計・累計値付きで返す（絞り込み無し）", () => {
    const rows = getWorkflowSummaries(db);

    expect(rows).toHaveLength(2);
    const active = rows.find((r) => r.workflowId === "wf-1");
    const inactive = rows.find((r) => r.workflowId === "wf-2");

    expect(active).toMatchObject({
      name: "Active Workflow",
      active: 1,
      successCount: 30,
      failureCount: 10,
      totalRuntimeMs: 5000,
      executionCount: 40,
      statisticsTotalCount: 105,
    });
    expect(inactive).toMatchObject({
      name: "Inactive Workflow",
      active: 0,
      successCount: 0,
      failureCount: 0,
      totalRuntimeMs: 0,
      executionCount: 0,
      statisticsTotalCount: 0,
    });
  });

  it("activeOnly指定でactive=1のみに絞り込む", () => {
    const rows = getWorkflowSummaries(db, { activeOnly: true });

    expect(rows).toHaveLength(1);
    expect(rows[0].workflowId).toBe("wf-1");
  });

  it("ワークフローが1件も無い場合は空配列を返す", () => {
    db.exec("DELETE FROM insights_by_period; DELETE FROM insights_metadata; DELETE FROM workflow_statistics; DELETE FROM workflow_entity;");

    const rows = getWorkflowSummaries(db);

    expect(rows).toEqual([]);
  });
});
