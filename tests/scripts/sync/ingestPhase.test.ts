import fs from "fs";
import os from "os";
import path from "path";

import Database from "better-sqlite3";

import { runIngestPhase } from "../../../scripts/sync/phases/ingestPhase";
import { initializeDatabase } from "../../../src/shared/db/init";
import { ALL_TABLE_NAMES } from "../../../src/shared/db/schema";
import type { ExtractedData } from "../../../scripts/sync/phases/extractPhase";

/**
 * ingestPhase.ts の単体テスト。
 *
 * - 全置換テーブルはDELETE→INSERTで冪等に置換されること
 * - execution_entityはUPSERTで追記蓄積され、2回目の同期でも古い明細が消えないこと
 * - 蓄積DBに機微テーブル（credentials等）が存在しないこと
 * - 取り込み件数がsync_history用に正しく返ること
 * - トランザクションが単一で、途中失敗時は全体がロールバックされること
 */

function makeExtracted(overrides: Partial<ExtractedData> = {}): ExtractedData {
  return {
    insightsByPeriod: [
      { metaId: 1, type: 2, value: 10, periodUnit: 1, periodStart: "2026-07-01T00:00:00.000Z" },
    ],
    insightsMetadata: [
      { metaId: 1, workflowId: "wf1", workflowName: "My Workflow", projectName: "Default" },
    ],
    workflowEntity: [
      { id: "wf1", name: "My Workflow", active: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" },
    ],
    workflowStatistics: [
      { workflowId: "wf1", name: "production_success", count: 5, latestEvent: "2026-07-01T00:00:00.000Z" },
    ],
    executionEntity: [
      {
        id: 100,
        workflowId: "wf1",
        status: "success",
        mode: "trigger",
        startedAt: "2026-07-01T00:00:00.000Z",
        stoppedAt: "2026-07-01T00:01:00.000Z",
        createdAt: "2026-07-01T00:00:00.000Z",
        finished: 1,
      },
    ],
    ...overrides,
  };
}

describe("runIngestPhase", () => {
  let tmpDir: string;
  let dbPath: string;
  let db: Database.Database;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "n8n-insights-viewer-ingest-test-"),
    );
    dbPath = path.join(tmpDir, "n8n_insights.sqlite");
    db = new Database(dbPath);
    initializeDatabase(db);
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("初回取り込みで各テーブルに行が入り、件数が正しく返る", () => {
    const result = runIngestPhase(db, makeExtracted());

    expect(result.rowsIngested).toEqual({
      insights_by_period: 1,
      insights_metadata: 1,
      workflow_entity: 1,
      workflow_statistics: 1,
      execution_entity: 1,
    });

    const ibp = db.prepare("SELECT * FROM insights_by_period").all();
    expect(ibp).toHaveLength(1);

    const exec = db
      .prepare("SELECT * FROM execution_entity WHERE id = 100")
      .get() as Record<string, unknown>;
    expect(exec.ingestedAt).toEqual(expect.any(String));
    expect((exec.ingestedAt as string).length).toBeGreaterThan(0);
  });

  it("全置換テーブルは2回目の同期で古い行が消え、新しい行だけになる(冪等性)", () => {
    runIngestPhase(db, makeExtracted());

    // 2回目の同期: metaIdが変わったデータのみが本番から取れた想定
    runIngestPhase(
      db,
      makeExtracted({
        insightsByPeriod: [
          { metaId: 2, type: 2, value: 99, periodUnit: 1, periodStart: "2026-07-02T00:00:00.000Z" },
        ],
        insightsMetadata: [
          { metaId: 2, workflowId: "wf2", workflowName: "Another Workflow", projectName: "Default" },
        ],
        workflowEntity: [
          { id: "wf2", name: "Another Workflow", active: 1, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-02T00:00:00.000Z" },
        ],
        workflowStatistics: [
          { workflowId: "wf2", name: "production_success", count: 1, latestEvent: "2026-07-02T00:00:00.000Z" },
        ],
      }),
    );

    const ibp = db.prepare("SELECT metaId FROM insights_by_period").all();
    expect(ibp).toEqual([{ metaId: 2 }]);

    const meta = db.prepare("SELECT metaId FROM insights_metadata").all();
    expect(meta).toEqual([{ metaId: 2 }]);

    const wf = db.prepare("SELECT id FROM workflow_entity").all();
    expect(wf).toEqual([{ id: "wf2" }]);

    const stats = db.prepare("SELECT workflowId FROM workflow_statistics").all();
    expect(stats).toEqual([{ workflowId: "wf2" }]);
  });

  it("execution_entityはUPSERTのため、2回目の同期でも古い実行明細(pruneされたもの)が消えない", () => {
    runIngestPhase(db, makeExtracted());

    // 2回目の同期: id=100は本番側でpruneされ、id=101のみが取得された想定
    const secondResult = runIngestPhase(
      db,
      makeExtracted({
        executionEntity: [
          {
            id: 101,
            workflowId: "wf1",
            status: "error",
            mode: "webhook",
            startedAt: "2026-07-02T00:00:00.000Z",
            stoppedAt: "2026-07-02T00:01:00.000Z",
            createdAt: "2026-07-02T00:00:00.000Z",
            finished: 1,
          },
        ],
      }),
    );

    expect(secondResult.rowsIngested.execution_entity).toBe(1);

    const rows = db
      .prepare("SELECT id, status FROM execution_entity ORDER BY id")
      .all();
    // id=100(1回目、pruneされて本番には無い)が消えずに残り、id=101が追加される
    expect(rows).toEqual([
      { id: 100, status: "success" },
      { id: 101, status: "error" },
    ]);
  });

  it("execution_entityのUPSERTは同一idの再取り込みで内容が更新される", () => {
    runIngestPhase(db, makeExtracted());

    runIngestPhase(
      db,
      makeExtracted({
        executionEntity: [
          {
            id: 100,
            workflowId: "wf1",
            status: "error",
            mode: "trigger",
            startedAt: "2026-07-01T00:00:00.000Z",
            stoppedAt: "2026-07-01T00:05:00.000Z",
            createdAt: "2026-07-01T00:00:00.000Z",
            finished: 1,
          },
        ],
      }),
    );

    const row = db
      .prepare("SELECT status, stoppedAt FROM execution_entity WHERE id = 100")
      .get() as Record<string, unknown>;
    expect(row.status).toBe("error");
    expect(row.stoppedAt).toBe("2026-07-01T00:05:00.000Z");

    const count = db
      .prepare("SELECT COUNT(*) as c FROM execution_entity")
      .get() as { c: number };
    expect(count.c).toBe(1);
  });

  it("蓄積DBには機微テーブル(credentials等)が一切存在しない", () => {
    runIngestPhase(db, makeExtracted());

    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => (row as { name: string }).name)
      // sqlite_sequence はAUTOINCREMENT利用時にSQLiteが自動生成する管理テーブル
      .filter((name) => name !== "sqlite_sequence");

    expect(tables.sort()).toEqual([...ALL_TABLE_NAMES].sort());
    expect(tables).not.toContain("credentials_entity");
    expect(tables).not.toContain("shared_credentials");
    expect(tables).not.toContain("variables");
  });

  it("取り込み中にエラーが起きた場合は単一トランザクションでロールバックされる", () => {
    // workflow_entity.nameはNOT NULLのため、nullを渡すと後段のinsertで例外が発生する
    const extracted = makeExtracted({
      workflowEntity: [
        // @ts-expect-error 意図的にNOT NULL制約違反を発生させる
        { id: "wf-broken", name: null, active: 1, createdAt: null, updatedAt: null },
      ],
    });

    expect(() => runIngestPhase(db, extracted)).toThrow();

    // insights_by_period等、workflow_entityより先に処理されるテーブルも
    // ロールバックされ空のままであること
    const ibp = db.prepare("SELECT * FROM insights_by_period").all();
    expect(ibp).toHaveLength(0);

    const wf = db.prepare("SELECT * FROM workflow_entity").all();
    expect(wf).toHaveLength(0);
  });
});
