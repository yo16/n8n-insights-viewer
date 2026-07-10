import Database from "better-sqlite3";

import { createTestDb } from "../testDbHelper";
import {
  countExecutions,
  getExecutions,
} from "../../../../src/lib/db/queries/executions";

/**
 * src/lib/db/queries/executions.ts の単体テスト
 * (docs/design/api-design.md §6, docs/design/frontend-design.md 画面4)
 */
describe("queries/executions", () => {
  let db: Database.Database;
  let cleanup: () => void;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());

    const insert = db.prepare(
      `INSERT INTO execution_entity
        (id, workflowId, status, mode, startedAt, stoppedAt, createdAt, finished, ingestedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    insert.run(
      1,
      "wf-1",
      "success",
      "trigger",
      "2026-07-01T00:00:00.000Z",
      "2026-07-01T00:00:05.000Z",
      "2026-07-01T00:00:00.000Z",
      1,
      "2026-07-01T01:00:00.000Z",
    );
    insert.run(
      2,
      "wf-1",
      "error",
      "manual",
      "2026-07-02T00:00:00.000Z",
      "2026-07-02T00:00:03.000Z",
      "2026-07-02T00:00:00.000Z",
      1,
      "2026-07-02T01:00:00.000Z",
    );
    insert.run(
      3,
      "wf-2",
      "success",
      "webhook",
      "2026-07-03T00:00:00.000Z",
      "2026-07-03T00:00:02.000Z",
      "2026-07-03T00:00:00.000Z",
      1,
      "2026-07-03T01:00:00.000Z",
    );
  });

  afterEach(() => {
    cleanup();
  });

  describe("getExecutions", () => {
    it("フィルタ無しの場合はstartedAt降順で全件返す", () => {
      const rows = getExecutions(db);

      expect(rows.map((r) => r.id)).toEqual([3, 2, 1]);
    });

    it("statusで絞り込める", () => {
      const rows = getExecutions(db, { status: "error" });

      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(2);
    });

    it("modeで絞り込める", () => {
      const rows = getExecutions(db, { mode: "webhook" });

      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(3);
    });

    it("workflowIdで絞り込める", () => {
      const rows = getExecutions(db, { workflowId: "wf-1" });

      expect(rows).toHaveLength(2);
      expect(rows.map((r) => r.id).sort()).toEqual([1, 2]);
    });

    it("期間（sinceIso/untilIso）で絞り込める", () => {
      const rows = getExecutions(db, {
        sinceIso: "2026-07-02T00:00:00.000Z",
        untilIso: "2026-07-03T00:00:00.000Z",
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(2);
    });

    it("limit/offsetでページネーションできる", () => {
      const page1 = getExecutions(db, { limit: 2, offset: 0 });
      const page2 = getExecutions(db, { limit: 2, offset: 2 });

      expect(page1.map((r) => r.id)).toEqual([3, 2]);
      expect(page2.map((r) => r.id)).toEqual([1]);
    });

    it("該当データが無い場合は空配列を返す", () => {
      const rows = getExecutions(db, { status: "waiting" });
      expect(rows).toEqual([]);
    });

    it("status×workflowIdの複合フィルタでAND条件が機能する", () => {
      const rows = getExecutions(db, { status: "success", workflowId: "wf-1" });

      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(1);
    });

    it("status×mode×期間の複合フィルタでAND条件が機能する", () => {
      const rows = getExecutions(db, {
        status: "success",
        mode: "webhook",
        sinceIso: "2026-07-03T00:00:00.000Z",
        untilIso: "2026-07-04T00:00:00.000Z",
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(3);
    });

    it("status×mode×workflowId×期間の全条件同時指定で1件のみ一致する", () => {
      const rows = getExecutions(db, {
        status: "error",
        mode: "manual",
        workflowId: "wf-1",
        sinceIso: "2026-07-01T12:00:00.000Z",
        untilIso: "2026-07-03T00:00:00.000Z",
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(2);
    });

    it("複合フィルタでいずれか1条件でも合致しない場合は0件になる（AND連結の検証）", () => {
      // wf-1×successの実行は存在するが、mode='webhook'とは組み合わさらない
      const rows = getExecutions(db, {
        status: "success",
        mode: "webhook",
        workflowId: "wf-1",
      });

      expect(rows).toEqual([]);
    });
  });

  describe("countExecutions", () => {
    it("フィルタ無しの場合は全件数を返す", () => {
      expect(countExecutions(db)).toBe(3);
    });

    it("フィルタ適用時はその件数を返す（limit/offsetの影響を受けない）", () => {
      expect(countExecutions(db, { workflowId: "wf-1" })).toBe(2);
    });

    it("該当データが無い場合は0を返す", () => {
      expect(countExecutions(db, { status: "waiting" })).toBe(0);
    });
  });
});
