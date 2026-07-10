/**
 * @jest-environment node
 */

/**
 * src/app/api/sync/route.ts の単体テスト。
 *
 * Route Handler内から実際に `npm run sync`（gcloud経由の本番同期）を
 * 起動しないよう、`src/lib/sync-process` の `startSyncJob` をモックして検証する。
 * Node の Request/Response グローバルを使うため `@jest-environment node` を指定する。
 */

const startSyncJobMock = jest.fn();

// route.ts側の `@/lib/sync-process` importはSWC変換時に相対パスへ書き換えられるため
// （next/jestはjest.mockの文字列引数までは書き換えない）、jest.mockは実体の相対パスで指定する。
jest.mock("../../../../src/lib/sync-process", () => ({
  startSyncJob: (...args: unknown[]) => startSyncJobMock(...args),
}));

describe("POST /api/sync", () => {
  beforeEach(() => {
    startSyncJobMock.mockReset();
  });

  it("起動成功時は200とjobIdを返す", async () => {
    startSyncJobMock.mockReturnValue({
      job: { id: "job-1", status: "running" },
      alreadyRunning: false,
    });

    const { POST } = await import("../../../../src/app/api/sync/route");
    const res = await POST();

    expect(res.status).toBe(200);
    const body = (await res.json()) as { jobId: string; status: string };
    expect(body).toEqual({ jobId: "job-1", status: "running" });
  });

  it("実行中ジョブがある場合は409と既存jobIdを返す", async () => {
    startSyncJobMock.mockReturnValue({
      job: { id: "job-existing", status: "running" },
      alreadyRunning: true,
    });

    const { POST } = await import("../../../../src/app/api/sync/route");
    const res = await POST();

    expect(res.status).toBe(409);
    const body = (await res.json()) as { jobId: string; status: string };
    expect(body).toEqual({ jobId: "job-existing", status: "running" });
  });

  it("force-dynamicが指定されている", async () => {
    const routeModule = await import("../../../../src/app/api/sync/route");
    expect(routeModule.dynamic).toBe("force-dynamic");
  });
});
