import { render, screen } from "@testing-library/react";

/**
 * src/app/machine/page.tsx のレンダリングテスト。
 *
 * `getDb`/各種クエリ関数/`loadThresholds` をjest.mockし、`buildMachineViewModel`
 * （純粋関数。別途 buildMachineViewModel.test.ts で検証済み）はモックせず実挙動を使う。
 *
 * next/jestはSWCでソースを変換するため、jest.mockの指定は`@/`エイリアスではなく
 * 実体の相対パスで行う（`tests/app/api/sync/route.test.ts` の既存パターンに倣う）。
 */

class MockDbNotFoundError extends Error {
  constructor(dbPath: string) {
    super(`DB not found: ${dbPath}`);
    this.name = "DbNotFoundError";
  }
}

const getDbMock = jest.fn();
jest.mock("../../../src/lib/db/connection", () => ({
  DbNotFoundError: MockDbNotFoundError,
  getDb: (...args: unknown[]) => getDbMock(...args),
}));

const getLatestMachineMetricsMock = jest.fn();
jest.mock("../../../src/lib/db/queries/dashboard", () => ({
  getLatestMachineMetrics: (...args: unknown[]) => getLatestMachineMetricsMock(...args),
}));

const getMachineMetricsMock = jest.fn();
const getContainerStatsMock = jest.fn();
const getCpuMetricsMock = jest.fn();
const getOomEventsMock = jest.fn();
jest.mock("../../../src/lib/db/queries/machine", () => ({
  getMachineMetrics: (...args: unknown[]) => getMachineMetricsMock(...args),
  getContainerStats: (...args: unknown[]) => getContainerStatsMock(...args),
  getCpuMetrics: (...args: unknown[]) => getCpuMetricsMock(...args),
  getOomEvents: (...args: unknown[]) => getOomEventsMock(...args),
}));

const loadThresholdsMock = jest.fn();
jest.mock("../../../src/lib/config/thresholds", () => ({
  loadThresholds: (...args: unknown[]) => loadThresholdsMock(...args),
}));

const THRESHOLDS = {
  memAvailableKb: { warning: 153600, danger: 102400 },
  swapUsedKb: { warning: 1048576, danger: 1572864 },
  dbSizeBytes: { warning: 419430400 },
  trendSampleMin: 4,
};

const DUMMY_DB = { dummy: true };

function machineRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    ts_utc: "2026-07-10T04:00:00.000Z",
    source: "cron",
    mem_total_kb: 2000000,
    mem_available_kb: 900000,
    mem_free_kb: 800000,
    swap_total_kb: 100000,
    swap_free_kb: 100000,
    loadavg_1: 0.1,
    loadavg_5: 0.2,
    loadavg_15: 0.3,
    db_size_bytes: 1000,
    wal_size_bytes: 0,
    rootfs_avail_bytes: 5000000,
    collector_version: "1",
    ...overrides,
  };
}

async function renderMachinePage(searchParams: Record<string, string | string[] | undefined> = {}) {
  // 動的importにすることで、ファイル先頭のjest.mockが確実に反映された状態でロードされる
  const { default: MachinePage } = await import("../../../src/app/machine/page");
  const jsx = await MachinePage({ searchParams: Promise.resolve(searchParams) });
  return render(jsx);
}

describe("MachinePage", () => {
  beforeEach(() => {
    getDbMock.mockReset();
    getLatestMachineMetricsMock.mockReset();
    getMachineMetricsMock.mockReset();
    getContainerStatsMock.mockReset();
    getCpuMetricsMock.mockReset();
    getOomEventsMock.mockReset();
    loadThresholdsMock.mockReset();

    getDbMock.mockReturnValue(DUMMY_DB);
    getMachineMetricsMock.mockReturnValue([]);
    getContainerStatsMock.mockReturnValue([]);
    getCpuMetricsMock.mockReturnValue([]);
    getOomEventsMock.mockReturnValue([]);
    getLatestMachineMetricsMock.mockReturnValue(undefined);
    loadThresholdsMock.mockReturnValue(THRESHOLDS);
  });

  it("DB未作成の場合、EmptyStateと同期画面へのリンクを表示する", async () => {
    getDbMock.mockImplementation(() => {
      throw new MockDbNotFoundError("/tmp/dummy.sqlite");
    });

    await renderMachinePage();

    expect(
      screen.getByText("まだ同期されていません。npm run sync を実行するか、同期画面から実行してください。"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "同期画面へ" })).toHaveAttribute("href", "/sync");
    // クエリ層は呼ばれない
    expect(getMachineMetricsMock).not.toHaveBeenCalled();
  });

  it("DbNotFoundError以外のエラーはそのまま再スローされる", async () => {
    const otherError = new Error("some other db error");
    getDbMock.mockImplementation(() => {
      throw otherError;
    });

    const { default: MachinePage } = await import("../../../src/app/machine/page");
    await expect(
      MachinePage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow("some other db error");
  });

  it("正常系: データがある場合、状態パネル・データ末尾注記・チャート群を表示する", async () => {
    getMachineMetricsMock.mockReturnValue([machineRow()]);
    getLatestMachineMetricsMock.mockReturnValue(machineRow());

    await renderMachinePage();

    // 見出し・期間フィルタ
    expect(screen.getByRole("heading", { level: 1, name: "マシン負荷" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "期間フィルタ" })).toBeInTheDocument();

    // 状態パネル
    expect(screen.getByRole("region", { name: "現在の状態" })).toBeInTheDocument();
    expect(screen.getByText("正常")).toBeInTheDocument();

    // データ末尾注記
    expect(screen.getByRole("note").textContent).toContain("データはここまで");

    // チャート群
    expect(screen.getByRole("heading", { name: "メモリ（MemAvailable）" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "スワップ使用量" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "load average" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "CPU使用率" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "database.sqlite サイズ" })).toBeInTheDocument();

    // データが該当期間にあるため、EmptyStateの「該当データなし」メッセージは出さない
    expect(
      screen.queryByText("この期間に該当するマシン負荷データがありません。"),
    ).not.toBeInTheDocument();
  });

  it("選択期間内にデータが無い場合、EmptyStateメッセージを表示しコンテナ別チャートは表示しない", async () => {
    // machineMetrics/containerStats等は全て空のまま（beforeEachの既定値）

    await renderMachinePage();

    expect(
      screen.getByText("この期間に該当するマシン負荷データがありません。"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "コンテナ別CPU使用率" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "コンテナ別メモリ使用量" })).not.toBeInTheDocument();

    // latestSampleUtcが無い(全期間未収集)ため、その旨の注記になる
    expect(screen.getByRole("note").textContent).toContain(
      "マシン負荷データが全期間で未収集です",
    );
  });

  it("コンテナ統計がある場合、コンテナ別チャートを表示する", async () => {
    getMachineMetricsMock.mockReturnValue([machineRow()]);
    getLatestMachineMetricsMock.mockReturnValue(machineRow());
    getContainerStatsMock.mockReturnValue([
      {
        id: 1,
        ts_utc: "2026-07-10T04:00:00.000Z",
        source: "cron",
        container_name: "n8n",
        cpu_pct: 12.5,
        mem_usage_bytes: 123456,
        mem_limit_bytes: 999999,
      },
    ]);

    await renderMachinePage();

    expect(screen.getByRole("heading", { name: "コンテナ別CPU使用率" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "コンテナ別メモリ使用量" })).toBeInTheDocument();
  });

  it("getLatestMachineMetricsはrangeスコープの引数を渡さず(range非依存で)呼び出される", async () => {
    getMachineMetricsMock.mockReturnValue([machineRow()]);
    getLatestMachineMetricsMock.mockReturnValue(machineRow());

    await renderMachinePage({ range: "24h" });

    // getMachineMetrics等は{sinceIso}付きで呼ばれる
    expect(getMachineMetricsMock).toHaveBeenCalledWith(
      DUMMY_DB,
      expect.objectContaining({ sinceIso: expect.any(String) }),
    );
    // getLatestMachineMetricsはdbのみで呼ばれる（第2引数(range)を渡さない）
    expect(getLatestMachineMetricsMock).toHaveBeenCalledTimes(1);
    expect(getLatestMachineMetricsMock).toHaveBeenCalledWith(DUMMY_DB);
    expect(getLatestMachineMetricsMock.mock.calls[0]).toHaveLength(1);
  });

  it("force-dynamicが指定されている", async () => {
    const pageModule = await import("../../../src/app/machine/page");
    expect(pageModule.dynamic).toBe("force-dynamic");
  });
});
