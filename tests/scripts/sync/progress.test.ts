import {
  PHASE_STATUSES,
  RESULT_STATUSES,
  SYNC_PHASES,
  SyncProgressEventSchema,
  emitPhaseDone,
  emitPhaseError,
  emitPhaseProgress,
  emitPhaseStart,
  emitProgress,
  emitResult,
} from "../../../scripts/sync/progress";

/**
 * progress.ts の単体テスト。
 * docs/design/data-sync-design.md §2.1 のJSON Lines形式に準拠しているか検証する。
 */
describe("SyncProgressEventSchema", () => {
  it("フェーズ進捗イベントを検証できる", () => {
    const event = { phase: "fetch", status: "start", ts: "2026-07-10T05:00:00Z" };
    expect(() => SyncProgressEventSchema.parse(event)).not.toThrow();
  });

  it("最終結果イベント(__result__)を検証できる", () => {
    const event = {
      phase: "__result__",
      status: "failed",
      rowsIngested: {},
      error: "boom",
    };
    expect(() => SyncProgressEventSchema.parse(event)).not.toThrow();
  });

  it("不正なphase名は拒否する", () => {
    const event = { phase: "unknown-phase", status: "start" };
    expect(() => SyncProgressEventSchema.parse(event)).toThrow();
  });

  it("不正なstatusは拒否する", () => {
    const event = { phase: "fetch", status: "unknown-status" };
    expect(() => SyncProgressEventSchema.parse(event)).toThrow();
  });

  it("6フェーズ名がすべて定義されている", () => {
    expect(SYNC_PHASES).toEqual([
      "fetch",
      "validate",
      "extract",
      "ingest",
      "collect-metrics",
      "cleanup",
    ]);
  });

  it("フェーズステータスはstart/progress/done/errorの4種", () => {
    expect(PHASE_STATUSES).toEqual(["start", "progress", "done", "error"]);
  });

  it("結果ステータスはsuccess/failed/abortedの3種", () => {
    expect(RESULT_STATUSES).toEqual(["success", "failed", "aborted"]);
  });
});

describe("emit* ヘルパー関数", () => {
  let writeSpy: jest.SpyInstance;
  const writtenLines: string[] = [];

  beforeEach(() => {
    writtenLines.length = 0;
    writeSpy = jest
      .spyOn(process.stdout, "write")
      .mockImplementation((chunk: unknown) => {
        writtenLines.push(String(chunk));
        return true;
      });
  });

  afterEach(() => {
    writeSpy.mockRestore();
  });

  function parseLastLine(): unknown {
    const last = writtenLines[writtenLines.length - 1];
    return JSON.parse(last.trimEnd());
  }

  it("emitProgressは1行のJSON+改行をstdoutへ書く", () => {
    emitProgress({ phase: "fetch", status: "start", ts: "2026-07-10T05:00:00Z" });
    expect(writtenLines).toHaveLength(1);
    expect(writtenLines[0].endsWith("\n")).toBe(true);
    expect(parseLastLine()).toMatchObject({ phase: "fetch", status: "start" });
  });

  it("emitPhaseStartはphase/status=startを出力する", () => {
    emitPhaseStart("validate");
    expect(parseLastLine()).toMatchObject({ phase: "validate", status: "start" });
  });

  it("emitPhaseProgressはmessage/pctを含められる", () => {
    emitPhaseProgress("fetch", "scp 120MB/300MB", 40);
    expect(parseLastLine()).toMatchObject({
      phase: "fetch",
      status: "progress",
      message: "scp 120MB/300MB",
      pct: 40,
    });
  });

  it("emitPhaseDoneはstatus=doneを出力する", () => {
    emitPhaseDone("cleanup");
    expect(parseLastLine()).toMatchObject({ phase: "cleanup", status: "done" });
  });

  it("emitPhaseErrorはstatus=error+messageを出力する", () => {
    emitPhaseError("validate", "schema mismatch");
    expect(parseLastLine()).toMatchObject({
      phase: "validate",
      status: "error",
      message: "schema mismatch",
    });
  });

  it("emitResultはphase=__result__を出力する", () => {
    emitResult("failed", { error: "boom" });
    expect(parseLastLine()).toMatchObject({
      phase: "__result__",
      status: "failed",
      error: "boom",
    });
  });

  it("emitProgressは不正なイベントを拒否する(型不整合の防止)", () => {
    expect(() =>
      // @ts-expect-error 意図的に不正な値を渡す
      emitProgress({ phase: "not-a-phase", status: "start" }),
    ).toThrow();
  });
});
