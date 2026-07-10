import { render, screen } from "@testing-library/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

/**
 * src/app/insights/page.tsx のレンダリングテスト。
 *
 * Server Component（async関数）を直接呼び出し、返却されたJSXをレンダリングして検証する。
 * DB接続・クエリ層・viewModelはjest.mockし、page.tsx自体の分岐ロジック
 * （DB未作成→EmptyState、0件→EmptyState、正常→チャート2枚+フィルタ表示）に集中する。
 */

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

const getDbMock = jest.fn();
class MockDbNotFoundError extends Error {}

jest.mock("../../../src/lib/db/connection", () => ({
  getDb: (...args: unknown[]) => getDbMock(...args),
  DbNotFoundError: MockDbNotFoundError,
}));

const getInsightsTimeSeriesMock = jest.fn();
jest.mock("../../../src/lib/db/queries/insights", () => ({
  getInsightsTimeSeries: (...args: unknown[]) => getInsightsTimeSeriesMock(...args),
}));

const getWorkflowSummariesMock = jest.fn();
jest.mock("../../../src/lib/db/queries/workflows", () => ({
  getWorkflowSummaries: (...args: unknown[]) => getWorkflowSummariesMock(...args),
}));

const normalizeInsightsToDailyMock = jest.fn();
jest.mock("../../../src/lib/aggregation/insightsNormalization", () => ({
  normalizeInsightsToDaily: (...args: unknown[]) => normalizeInsightsToDailyMock(...args),
}));

const buildInsightsChartDataMock = jest.fn();
const resolveQueryFromIsoMock = jest.fn();
jest.mock("../../../src/app/insights/viewModel", () => ({
  buildInsightsChartData: (...args: unknown[]) => buildInsightsChartDataMock(...args),
  resolveQueryFromIso: (...args: unknown[]) => resolveQueryFromIsoMock(...args),
}));

const mockedUsePathname = usePathname as jest.Mock;
const mockedUseRouter = useRouter as jest.Mock;
const mockedUseSearchParams = useSearchParams as jest.Mock;

async function renderPage(searchParams: { range?: string; workflowId?: string } = {}) {
  const { default: InsightsPage } = await import("../../../src/app/insights/page");
  const jsx = await InsightsPage({ searchParams: Promise.resolve(searchParams) });
  return render(jsx);
}

describe("app/insights/page", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUsePathname.mockReturnValue("/insights");
    mockedUseRouter.mockReturnValue({ push: jest.fn() });
    mockedUseSearchParams.mockReturnValue(new URLSearchParams());
    resolveQueryFromIsoMock.mockReturnValue("2026-01-01T00:00:00.000Z");
    getInsightsTimeSeriesMock.mockReturnValue([]);
    normalizeInsightsToDailyMock.mockReturnValue([]);
    getWorkflowSummariesMock.mockReturnValue([]);
  });

  it("DBが未作成の場合、EmptyStateで同期案内を表示する", async () => {
    getDbMock.mockImplementation(() => {
      throw new MockDbNotFoundError("not found");
    });

    await renderPage();

    expect(screen.getByText("まだ同期されていません")).toBeInTheDocument();
    expect(
      screen.getByText("npm run sync を実行するか、同期画面から同期を実行してください。"),
    ).toBeInTheDocument();
  });

  it("DbNotFoundError以外のエラーはそのまま再スローする", async () => {
    getDbMock.mockImplementation(() => {
      throw new Error("unexpected db error");
    });

    await expect(renderPage()).rejects.toThrow("unexpected db error");
  });

  it("該当データが0件の場合、EmptyStateで絞り込み見直しを案内する", async () => {
    getDbMock.mockReturnValue({});
    buildInsightsChartDataMock.mockReturnValue({
      executionsData: [],
      runtimeData: [],
      hasAnyData: false,
      lastDataDayKey: null,
      todayDayKey: "2026-07-10",
      hasApproxPoints: false,
    });

    await renderPage();

    expect(
      screen.getByText(
        "条件に一致するデータがありません。期間やワークフローの絞り込みを見直してください。",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "実行数（成功/失敗）" })).not.toBeInTheDocument();
  });

  it("正常系: データがある場合、チャート2枚とフィルタバーを表示する", async () => {
    getDbMock.mockReturnValue({});
    getWorkflowSummariesMock.mockReturnValue([
      { workflowId: "wf-1", name: "ワークフローA", active: 1 },
    ]);
    buildInsightsChartDataMock.mockReturnValue({
      executionsData: [{ key: "2026-07-09", success: 1, failure: 0 }],
      runtimeData: [{ key: "2026-07-09", runtimeMs: 1000 }],
      hasAnyData: true,
      lastDataDayKey: "2026-07-09",
      todayDayKey: "2026-07-10",
      hasApproxPoints: false,
    });

    await renderPage({ range: "30d" });

    expect(screen.getByRole("heading", { name: "Insights推移" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "実行数（成功/失敗）" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "実行時間（合計）" })).toBeInTheDocument();
    expect(screen.getByLabelText("期間")).toBeInTheDocument();
    expect(screen.getByLabelText("ワークフロー")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "ワークフローA" })).toBeInTheDocument();
  });

  it("正常系: lastDataDayKeyが今日より前の場合、DataCoverageNoticeを表示する", async () => {
    getDbMock.mockReturnValue({});
    buildInsightsChartDataMock.mockReturnValue({
      executionsData: [{ key: "2026-07-09", success: 1, failure: 0 }],
      runtimeData: [{ key: "2026-07-09", runtimeMs: 1000 }],
      hasAnyData: true,
      lastDataDayKey: "2026-07-09",
      todayDayKey: "2026-07-10",
      hasApproxPoints: false,
    });

    await renderPage();

    expect(screen.getByRole("status")).toHaveTextContent("データはここまで");
  });

  it("正常系: lastDataDayKeyが今日と同じ場合、DataCoverageNoticeを表示しない", async () => {
    getDbMock.mockReturnValue({});
    buildInsightsChartDataMock.mockReturnValue({
      executionsData: [{ key: "2026-07-10", success: 1, failure: 0 }],
      runtimeData: [{ key: "2026-07-10", runtimeMs: 1000 }],
      hasAnyData: true,
      lastDataDayKey: "2026-07-10",
      todayDayKey: "2026-07-10",
      hasApproxPoints: false,
    });

    await renderPage();

    expect(screen.queryByText(/データはここまで/)).not.toBeInTheDocument();
  });

  it("hasApproxPoints=trueの場合、UTC近似注記とweek近似注記の両方をチャートに表示する", async () => {
    getDbMock.mockReturnValue({});
    buildInsightsChartDataMock.mockReturnValue({
      executionsData: [{ key: "2026-07-09", success: 1, failure: 0, isApprox: true }],
      runtimeData: [{ key: "2026-07-09", runtimeMs: 1000, isApprox: true }],
      hasAnyData: true,
      lastDataDayKey: "2026-07-09",
      todayDayKey: "2026-07-10",
      hasApproxPoints: true,
    });

    await renderPage();

    expect(
      screen.getAllByText(
        "この期間の日次値はUTC区切りの近似値です（JSTとは最大9時間ずれる場合があります）。",
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/1週間分の値を1日分の点としてまとめて/).length,
    ).toBeGreaterThan(0);
  });

  it("hasApproxPoints=falseの場合、week近似注記を表示しない", async () => {
    getDbMock.mockReturnValue({});
    buildInsightsChartDataMock.mockReturnValue({
      executionsData: [{ key: "2026-07-09", success: 1, failure: 0 }],
      runtimeData: [{ key: "2026-07-09", runtimeMs: 1000 }],
      hasAnyData: true,
      lastDataDayKey: "2026-07-09",
      todayDayKey: "2026-07-10",
      hasApproxPoints: false,
    });

    await renderPage();

    expect(screen.queryByText(/1週間分の値を1日分の点としてまとめて/)).not.toBeInTheDocument();
  });

  it("workflowIdクエリパラメータが空文字の場合はundefinedとして扱う（フィルタなし）", async () => {
    getDbMock.mockReturnValue({});
    buildInsightsChartDataMock.mockReturnValue({
      executionsData: [],
      runtimeData: [],
      hasAnyData: false,
      lastDataDayKey: null,
      todayDayKey: "2026-07-10",
      hasApproxPoints: false,
    });

    await renderPage({ workflowId: "" });

    expect(getInsightsTimeSeriesMock).toHaveBeenCalled();
    const callArg = getInsightsTimeSeriesMock.mock.calls[0][1] as { workflowId?: string };
    expect(callArg.workflowId).toBeUndefined();
  });

  it("workflowIdクエリパラメータが指定された場合、getInsightsTimeSeriesにそのまま渡す（フィルタが効く側の結線確認）", async () => {
    getDbMock.mockReturnValue({});
    buildInsightsChartDataMock.mockReturnValue({
      executionsData: [],
      runtimeData: [],
      hasAnyData: false,
      lastDataDayKey: null,
      todayDayKey: "2026-07-10",
      hasApproxPoints: false,
    });

    await renderPage({ workflowId: "wf-1" });

    expect(getInsightsTimeSeriesMock).toHaveBeenCalled();
    for (const call of getInsightsTimeSeriesMock.mock.calls) {
      const filter = call[1] as { workflowId?: string };
      expect(filter.workflowId).toBe("wf-1");
    }
  });

  it("getInsightsTimeSeriesがHour/Day/Weekの3粒度で3回呼ばれ、各回のsinceIsoがresolveQueryFromIso由来の値になる（粒度取得ループの結線確認）", async () => {
    getDbMock.mockReturnValue({});
    resolveQueryFromIsoMock.mockReturnValue("2026-06-01T00:00:00.000Z");
    buildInsightsChartDataMock.mockReturnValue({
      executionsData: [],
      runtimeData: [],
      hasAnyData: false,
      lastDataDayKey: null,
      todayDayKey: "2026-07-10",
      hasApproxPoints: false,
    });

    await renderPage({ range: "30d" });

    expect(getInsightsTimeSeriesMock).toHaveBeenCalledTimes(3);

    const periodUnits = getInsightsTimeSeriesMock.mock.calls.map(
      (call) => (call[1] as { periodUnit: number }).periodUnit,
    );
    expect(periodUnits.sort()).toEqual([0, 1, 2]);

    for (const call of getInsightsTimeSeriesMock.mock.calls) {
      const filter = call[1] as { sinceIso: string };
      expect(filter.sinceIso).toBe("2026-06-01T00:00:00.000Z");
    }
  });

  it("dynamic exportがforce-dynamicである", async () => {
    const pageModule = await import("../../../src/app/insights/page");
    expect(pageModule.dynamic).toBe("force-dynamic");
  });
});
