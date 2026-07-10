/**
 * @jest-environment node
 */

/**
 * src/app/api/sync/stream/route.ts の単体テスト。
 *
 * `src/lib/sync-process` の `getCurrentJob`/`subscribeToSyncJob` をモックし、
 * SSEレスポンスの最初のイベント（アイドル/結果/進捗）を検証する
 * （実プロセスの起動は行わない）。
 */

const getCurrentJobMock = jest.fn();
const subscribeToSyncJobMock = jest.fn();

// route.ts側の `@/lib/sync-process` importはSWC変換時に相対パスへ書き換えられるため
// （next/jestはjest.mockの文字列引数までは書き換えない）、jest.mockは実体の相対パスで指定する。
jest.mock("../../../../src/lib/sync-process", () => ({
  getCurrentJob: () => getCurrentJobMock(),
  subscribeToSyncJob: (...args: unknown[]) => subscribeToSyncJobMock(...args),
}));

async function readAllChunks(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    out += decoder.decode(value, { stream: true });
  }
  return out;
}

describe("GET /api/sync/stream", () => {
  beforeEach(() => {
    getCurrentJobMock.mockReset();
    subscribeToSyncJobMock.mockReset();
  });

  it("実行中ジョブが無い場合はidleイベントを送ってcloseする", async () => {
    getCurrentJobMock.mockReturnValue(undefined);

    const { GET } = await import("../../../../src/app/api/sync/stream/route");
    const res = await GET();

    expect(res.headers.get("Content-Type")).toBe("text/event-stream");
    const text = await readAllChunks(res);
    expect(text).toBe(`data: ${JSON.stringify({ type: "idle" })}\n\n`);
  });

  it("直近ジョブが完了済み（success）の場合は結果イベントを送ってcloseする", async () => {
    const job = {
      id: "job-1",
      status: "success",
      startedAt: "2026-07-10T00:00:00.000Z",
      finishedAt: "2026-07-10T00:01:00.000Z",
      exitCode: 0,
      events: [],
    };
    getCurrentJobMock.mockReturnValue(job);

    const { GET } = await import("../../../../src/app/api/sync/stream/route");
    const res = await GET();

    const text = await readAllChunks(res);
    expect(text).toBe(`data: ${JSON.stringify({ type: "result", job })}\n\n`);
  });

  it("実行中ジョブがある場合は履歴をflushし、購読で進捗→結果を配信してcloseする", async () => {
    const progressEvent = { phase: "fetch", status: "start" };
    const job = {
      id: "job-2",
      status: "running",
      startedAt: "2026-07-10T00:00:00.000Z",
      events: [progressEvent],
    };
    getCurrentJobMock.mockReturnValue(job);

    let capturedCallback:
      | ((update: { type: string; event?: unknown; job?: unknown }) => void)
      | undefined;
    const unsubscribeMock = jest.fn();
    subscribeToSyncJobMock.mockImplementation((cb: typeof capturedCallback) => {
      capturedCallback = cb;
      return unsubscribeMock;
    });

    const { GET } = await import("../../../../src/app/api/sync/stream/route");
    const res = await GET();
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // 履歴（progressEvent）がまずflushされる
    const first = await reader.read();
    expect(decoder.decode(first.value)).toBe(
      `data: ${JSON.stringify(progressEvent)}\n\n`,
    );

    // 購読コールバックが登録されている
    expect(capturedCallback).toBeDefined();

    const finishedJob = { ...job, status: "success" };
    capturedCallback?.({ type: "finished", job: finishedJob });

    const second = await reader.read();
    expect(decoder.decode(second.value)).toBe(
      `data: ${JSON.stringify({ type: "result", job: finishedJob })}\n\n`,
    );

    const third = await reader.read();
    expect(third.done).toBe(true);
    expect(unsubscribeMock).toHaveBeenCalled();
  });

  it("force-dynamicが指定されている", async () => {
    const routeModule = await import("../../../../src/app/api/sync/stream/route");
    expect(routeModule.dynamic).toBe("force-dynamic");
  });
});
