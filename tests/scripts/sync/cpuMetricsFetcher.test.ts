import { fetchCpuMetricsViaRestApi } from "../../../scripts/sync/cpuMetricsFetcher";
import type { GcloudSyncConfig } from "../../../scripts/sync/config";
import { FakeCommandRunner } from "./fakes/fakeCommandRunner";

/**
 * cpuMetricsFetcher.ts の単体テスト。
 *
 * **絶対厳守**: 実gcloudコマンド・実HTTP呼び出しは一切行わない。
 * アクセストークン取得は FakeCommandRunner、HTTP呼び出しは
 * モック関数（fetchFnオプション）で差し替える。
 */
describe("fetchCpuMetricsViaRestApi", () => {
  const gcloudConfig: GcloudSyncConfig = {
    project: "test-project",
    zone: "test-zone",
    instance: "test-instance",
    remoteDbPath: "/root/n8n/.n8n/database.sqlite",
    remoteTmpDir: "/tmp/n8n_insights_sync",
  };

  function makeResponse(
    body: string,
    init: { ok?: boolean; status?: number } = {},
  ): Response {
    return {
      ok: init.ok ?? true,
      status: init.status ?? 200,
      text: async () => body,
    } as Response;
  }

  it("アクセストークンを取得し、Bearerヘッダを付与してREST APIを呼び出す", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "fake-access-token\n", stderr: "", exitCode: 0 },
    ]);
    const fetchFn = jest.fn().mockResolvedValue(
      makeResponse(
        JSON.stringify({
          timeSeries: [
            {
              points: [
                {
                  interval: { endTime: "2026-07-10T04:00:00Z" },
                  value: { doubleValue: 0.032 },
                },
              ],
            },
          ],
        }),
      ),
    );

    const points = await fetchCpuMetricsViaRestApi({
      runner,
      gcloudConfig,
      intervalStartTimeIso: "2026-07-01T00:00:00.000Z",
      intervalEndTimeIso: "2026-07-10T00:00:00.000Z",
      fetchFn,
    });

    expect(points).toEqual([
      { tsUtc: "2026-07-10T04:00:00.000Z", cpuUtil: 0.032 },
    ]);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain("https://monitoring.googleapis.com/v3/projects/test-project/timeSeries");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer fake-access-token",
    );
  });

  it("nextPageTokenがある場合はページネーションして全ページ分を統合する", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "fake-access-token", stderr: "", exitCode: 0 },
    ]);

    const fetchFn = jest
      .fn()
      .mockResolvedValueOnce(
        makeResponse(
          JSON.stringify({
            timeSeries: [
              {
                points: [
                  {
                    interval: { endTime: "2026-07-10T04:00:00Z" },
                    value: { doubleValue: 0.01 },
                  },
                ],
              },
            ],
            nextPageToken: "page-2",
          }),
        ),
      )
      .mockResolvedValueOnce(
        makeResponse(
          JSON.stringify({
            timeSeries: [
              {
                points: [
                  {
                    interval: { endTime: "2026-07-10T05:00:00Z" },
                    value: { doubleValue: 0.02 },
                  },
                ],
              },
            ],
          }),
        ),
      );

    const points = await fetchCpuMetricsViaRestApi({
      runner,
      gcloudConfig,
      intervalStartTimeIso: "2026-07-01T00:00:00.000Z",
      intervalEndTimeIso: "2026-07-10T00:00:00.000Z",
      fetchFn,
    });

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const secondCallUrl = fetchFn.mock.calls[1][0] as string;
    expect(secondCallUrl).toContain("pageToken=page-2");

    expect(points).toEqual([
      { tsUtc: "2026-07-10T04:00:00.000Z", cpuUtil: 0.01 },
      { tsUtc: "2026-07-10T05:00:00.000Z", cpuUtil: 0.02 },
    ]);
  });

  it("アクセストークン取得コマンドが失敗した場合は例外を投げる", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "", stderr: "no active account", exitCode: 1 },
    ]);
    const fetchFn = jest.fn();

    await expect(
      fetchCpuMetricsViaRestApi({
        runner,
        gcloudConfig,
        intervalStartTimeIso: "2026-07-01T00:00:00.000Z",
        intervalEndTimeIso: "2026-07-10T00:00:00.000Z",
        fetchFn,
      }),
    ).rejects.toThrow(/アクセストークン/);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("アクセストークンが空文字の場合は例外を投げる", async () => {
    const runner = new FakeCommandRunner([{ stdout: "  \n", stderr: "", exitCode: 0 }]);
    const fetchFn = jest.fn();

    await expect(
      fetchCpuMetricsViaRestApi({
        runner,
        gcloudConfig,
        intervalStartTimeIso: "2026-07-01T00:00:00.000Z",
        intervalEndTimeIso: "2026-07-10T00:00:00.000Z",
        fetchFn,
      }),
    ).rejects.toThrow(/アクセストークン/);
  });

  it("HTTP 403エラーの場合は例外を投げる", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "fake-access-token", stderr: "", exitCode: 0 },
    ]);
    const fetchFn = jest
      .fn()
      .mockResolvedValue(makeResponse("permission denied", { ok: false, status: 403 }));

    await expect(
      fetchCpuMetricsViaRestApi({
        runner,
        gcloudConfig,
        intervalStartTimeIso: "2026-07-01T00:00:00.000Z",
        intervalEndTimeIso: "2026-07-10T00:00:00.000Z",
        fetchFn,
      }),
    ).rejects.toThrow(/HTTP 403/);
  });

  it("HTTP 500エラーの場合は例外を投げる", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "fake-access-token", stderr: "", exitCode: 0 },
    ]);
    const fetchFn = jest
      .fn()
      .mockResolvedValue(makeResponse("internal error", { ok: false, status: 500 }));

    await expect(
      fetchCpuMetricsViaRestApi({
        runner,
        gcloudConfig,
        intervalStartTimeIso: "2026-07-01T00:00:00.000Z",
        intervalEndTimeIso: "2026-07-10T00:00:00.000Z",
        fetchFn,
      }),
    ).rejects.toThrow(/HTTP 500/);
  });

  it("fetchがタイムアウト(reject)した場合は例外を投げる", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "fake-access-token", stderr: "", exitCode: 0 },
    ]);
    const fetchFn = jest
      .fn()
      .mockRejectedValue(new Error("The operation was aborted due to timeout"));

    await expect(
      fetchCpuMetricsViaRestApi({
        runner,
        gcloudConfig,
        intervalStartTimeIso: "2026-07-01T00:00:00.000Z",
        intervalEndTimeIso: "2026-07-10T00:00:00.000Z",
        fetchFn,
      }),
    ).rejects.toThrow(/timeout/);
  });
});
