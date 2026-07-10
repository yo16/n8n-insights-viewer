import Database from "better-sqlite3";

import { createTestDb } from "../testDbHelper";
import { getInsightsTimeSeries } from "../../../../src/lib/db/queries/insights";

/**
 * src/lib/db/queries/insights.ts の単体テスト
 * (docs/design/api-design.md §6, docs/design/frontend-design.md 画面2)
 */
describe("queries/insights", () => {
  let db: Database.Database;
  let cleanup: () => void;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());

    db.prepare(
      "INSERT INTO insights_metadata (metaId, workflowId, workflowName, projectName) VALUES (?, ?, ?, ?)",
    ).run(1, "wf-1", "Workflow One", "Default");
    db.prepare(
      "INSERT INTO insights_metadata (metaId, workflowId, workflowName, projectName) VALUES (?, ?, ?, ?)",
    ).run(2, "wf-2", "Workflow Two", "Default");

    const insert = db.prepare(
      "INSERT INTO insights_by_period (metaId, type, value, periodUnit, periodStart) VALUES (?, ?, ?, ?, ?)",
    );
    // periodUnit: 1=day
    insert.run(1, 2, 10, 1, "2026-07-01T00:00:00.000Z");
    insert.run(1, 2, 20, 1, "2026-07-02T00:00:00.000Z");
    insert.run(2, 2, 5, 1, "2026-07-01T00:00:00.000Z");
    // 別粒度（hour）は絞り込み対象外になることを確認する
    insert.run(1, 2, 999, 0, "2026-07-01T00:00:00.000Z");
  });

  afterEach(() => {
    cleanup();
  });

  it("periodUnitで絞り込み、periodStart昇順で結合済みの行を返す", () => {
    const rows = getInsightsTimeSeries(db, {
      periodUnit: 1,
      sinceIso: "2026-07-01T00:00:00.000Z",
    });

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.value)).toEqual([10, 5, 20]);
    expect(rows[0].workflowName).toBe("Workflow One");
    expect(rows[0].workflowId).toBe("wf-1");
  });

  it("workflowIdで絞り込める", () => {
    const rows = getInsightsTimeSeries(db, {
      periodUnit: 1,
      sinceIso: "2026-07-01T00:00:00.000Z",
      workflowId: "wf-2",
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(5);
    expect(rows[0].workflowId).toBe("wf-2");
  });

  it("untilIsoで期間の上限を絞り込める", () => {
    const rows = getInsightsTimeSeries(db, {
      periodUnit: 1,
      sinceIso: "2026-07-01T00:00:00.000Z",
      untilIso: "2026-07-02T00:00:00.000Z",
    });

    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.periodStart < "2026-07-02T00:00:00.000Z")).toBe(
      true,
    );
  });

  it("該当データが無い場合は空配列を返す", () => {
    const rows = getInsightsTimeSeries(db, {
      periodUnit: 2,
      sinceIso: "2026-07-01T00:00:00.000Z",
    });

    expect(rows).toEqual([]);
  });
});
