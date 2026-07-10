import Database from "better-sqlite3";

import { createTestDb } from "../testDbHelper";
import {
  getLatestSyncHistory,
  getSyncHistoryList,
} from "../../../../src/lib/db/queries/sync";

/**
 * src/lib/db/queries/sync.ts の単体テスト
 * (docs/design/api-design.md §6, docs/design/frontend-design.md 画面6)
 */
describe("queries/sync", () => {
  let db: Database.Database;
  let cleanup: () => void;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => {
    cleanup();
  });

  describe("getLatestSyncHistory", () => {
    it("started_atが最大の1件を返す", () => {
      const insert = db.prepare(
        "INSERT INTO sync_history (started_at, status) VALUES (?, ?)",
      );
      insert.run("2026-07-01T00:00:00.000Z", "success");
      insert.run("2026-07-03T00:00:00.000Z", "failed");
      insert.run("2026-07-02T00:00:00.000Z", "success");

      const latest = getLatestSyncHistory(db);

      expect(latest?.started_at).toBe("2026-07-03T00:00:00.000Z");
      expect(latest?.status).toBe("failed");
    });

    it("データが無い場合はundefinedを返す", () => {
      expect(getLatestSyncHistory(db)).toBeUndefined();
    });
  });

  describe("getSyncHistoryList", () => {
    it("started_at降順で一覧を返す", () => {
      const insert = db.prepare(
        "INSERT INTO sync_history (started_at, status) VALUES (?, ?)",
      );
      insert.run("2026-07-01T00:00:00.000Z", "success");
      insert.run("2026-07-02T00:00:00.000Z", "success");
      insert.run("2026-07-03T00:00:00.000Z", "failed");

      const rows = getSyncHistoryList(db);

      expect(rows.map((r) => r.started_at)).toEqual([
        "2026-07-03T00:00:00.000Z",
        "2026-07-02T00:00:00.000Z",
        "2026-07-01T00:00:00.000Z",
      ]);
    });

    it("limitで件数を絞り込める", () => {
      const insert = db.prepare(
        "INSERT INTO sync_history (started_at, status) VALUES (?, ?)",
      );
      insert.run("2026-07-01T00:00:00.000Z", "success");
      insert.run("2026-07-02T00:00:00.000Z", "success");
      insert.run("2026-07-03T00:00:00.000Z", "failed");

      const rows = getSyncHistoryList(db, 2);

      expect(rows).toHaveLength(2);
    });

    it("データが無い場合は空配列を返す", () => {
      expect(getSyncHistoryList(db)).toEqual([]);
    });
  });
});
