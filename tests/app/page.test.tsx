import { render, screen } from "@testing-library/react";
import { formatBytes, formatPercent } from "@/components/charts/format";
import { formatJstDateTime } from "@/shared/datetime";

/**
 * src/app/page.tsx（画面1: ダッシュボード）の結合テスト。
 *
 * DB接続・クエリ層（getDb / queries/dashboard / queries/machine / config/thresholds）を
 * jest.mockし、Server Componentの組み立て（表示切り替え・DbNotFoundErrorのフォールバック・
 * 実データを与えた場合の集計〜表示の一連の流れ）を検証する。
 * 集計ロジック自体の単体検証（前期間比・トレンド・状態評価の計算式）は各lib配下の
 * 単体テストで検証済みのため、ここではモックしたクエリ結果が正しく画面へ反映される
 * ことに専念する。formatBytes/formatDurationMs/formatPercent/formatJstDateTimeは
 * 表示専用の純粋関数であり、モック対象外（実装をそのまま利用して期待値を算出する）。
 */

const getDbMock = jest.fn();
class FakeDbNotFoundError extends Error {}

// page.tsx側の "@/..." importはSWC変換時に相対パスへ書き換えられるため
// （next/jestはjest.mockの文字列引数までは書き換えない）、jest.mockは実体の相対パスで指定する。
jest.mock("../../src/lib/db/connection", () => ({
  getDb: () => getDbMock(),
  DbNotFoundError: FakeDbNotFoundError,
}));

const getInsightsSummaryMock = jest.fn();
const getLatestMachineMetricsMock = jest.fn();
const getRecentMachineMetricsSeriesMock = jest.fn();

jest.mock("../../src/lib/db/queries/dashboard", () => ({
  getInsightsSummary: (...args: unknown[]) => getInsightsSummaryMock(...args),
  getLatestMachineMetrics: (...args: unknown[]) => getLatestMachineMetricsMock(...args),
  getRecentMachineMetricsSeries: (...args: unknown[]) =>
    getRecentMachineMetricsSeriesMock(...args),
}));

const getMachineMetricsMock = jest.fn();
jest.mock("../../src/lib/db/queries/machine", () => ({
  getMachineMetrics: (...args: unknown[]) => getMachineMetricsMock(...args),
}));

const loadThresholdsMock = jest.fn();
jest.mock("../../src/lib/config/thresholds", () => ({
  loadThresholds: (...args: unknown[]) => loadThresholdsMock(...args),
}));

const THRESHOLDS = {
  memAvailableKb: { warning: 200_000, danger: 100_000 },
  swapUsedKb: { warning: 500_000, danger: 1_000_000 },
  dbSizeBytes: { warning: 5_000_000_000 },
  trendSampleMin: 5,
};

function emptyInsightsSummary() {
  return {
    successCount: 0,
    failureCount: 0,
    totalRuntimeMs: 0,
    totalExecutions: 0,
    successRate: null as number | null,
  };
}

/** MachineMetricsRow の必須フィールドを埋めた最小データを組み立てる（テスト用ヘルパ）。 */
function machineMetricsRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    ts_utc: "2026-07-10T00:00:00.000Z",
    source: "collector",
    mem_total_kb: 1_000_000,
    mem_available_kb: 400_000,
    mem_free_kb: 300_000,
    swap_total_kb: 1_000_000,
    swap_free_kb: 950_000,
    loadavg_1: 0.1,
    loadavg_5: 0.2,
    loadavg_15: 0.3,
    db_size_bytes: 1_000_000,
    wal_size_bytes: 10_000,
    rootfs_avail_bytes: 5_000_000_000,
    collector_version: "1.0.0",
    ...overrides,
  };
}

describe("DashboardPage", () => {
  beforeEach(() => {
    getDbMock.mockReset();
    getInsightsSummaryMock.mockReset();
    getLatestMachineMetricsMock.mockReset();
    getRecentMachineMetricsSeriesMock.mockReset();
    getMachineMetricsMock.mockReset();
    loadThresholdsMock.mockReset();

    loadThresholdsMock.mockReturnValue(THRESHOLDS);
    getDbMock.mockReturnValue({});
    getRecentMachineMetricsSeriesMock.mockReturnValue([]);
    getMachineMetricsMock.mockReturnValue([]);
    getLatestMachineMetricsMock.mockReturnValue(undefined);
    getInsightsSummaryMock.mockImplementation(() => emptyInsightsSummary());
  });

  it("dynamic exportに'force-dynamic'が指定されている", async () => {
    const pageModule = await import("../../src/app/page");
    expect(pageModule.dynamic).toBe("force-dynamic");
  });

  it("正常系: 見出し・状態バッジ・直近7日/30日のサマリ（値・前期間比）を表示する", async () => {
    // 7日: current/previous, 30日: current/previous の順でgetInsightsSummaryが呼ばれる
    // （buildPeriodStats(db, 7, ...) → buildPeriodStats(db, 30, ...) の呼び出し順）。
    getInsightsSummaryMock
      .mockReturnValueOnce({
        successCount: 90,
        failureCount: 10,
        totalRuntimeMs: 120_000,
        totalExecutions: 100,
        successRate: 0.9,
      }) // 7日: current
      .mockReturnValueOnce({
        successCount: 68,
        failureCount: 12,
        totalRuntimeMs: 100_000,
        totalExecutions: 80,
        successRate: 0.86,
      }) // 7日: previous
      .mockReturnValueOnce({
        successCount: 380,
        failureCount: 20,
        totalRuntimeMs: 500_000,
        totalExecutions: 400,
        successRate: 0.95,
      }) // 30日: current
      .mockReturnValueOnce({
        successCount: 288,
        failureCount: 32,
        totalRuntimeMs: 450_000,
        totalExecutions: 320,
        successRate: 0.9,
      }); // 30日: previous

    getLatestMachineMetricsMock.mockReturnValue(machineMetricsRow());

    const { default: Page } = await import("../../src/app/page");
    render(<Page />);

    expect(screen.getByRole("heading", { name: "ダッシュボード" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument(); // StatusBadge
    expect(screen.getByRole("heading", { name: "直近7日" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "直近30日" })).toBeInTheDocument();

    // --- 7日: 総実行数 (100-80=20, +25.0%) ---
    expect(screen.getByText("前期間比 +20（+25.0%）")).toBeInTheDocument();
    // --- 7日: 成功率 (90.0%, delta +4.0pt = (0.9-0.86)*100) ---
    expect(screen.getByText(formatPercent(0.9 * 100))).toBeInTheDocument();
    expect(screen.getByText("前期間比 +4.0pt")).toBeInTheDocument();
    // --- 7日: 失敗数 (10-12=-2, 割合表示なし) ---
    expect(screen.getByText("前期間比 -2")).toBeInTheDocument();
    // --- 7日: 総実行時間 (120000-100000=20000ms=20.0秒, +20.0%) ---
    expect(screen.getByText("前期間比 +20.0秒（+20.0%）")).toBeInTheDocument();

    // --- 30日: 総実行数 (400-320=80, +25.0%) ---
    expect(screen.getByText("前期間比 +80（+25.0%）")).toBeInTheDocument();
    // --- 30日: 成功率 (95.0%, delta +5.0pt = (0.95-0.9)*100) ---
    expect(screen.getByText(formatPercent(0.95 * 100))).toBeInTheDocument();
    expect(screen.getByText("前期間比 +5.0pt")).toBeInTheDocument();
    // --- 30日: 失敗数 (20-32=-12) ---
    expect(screen.getByText("前期間比 -12")).toBeInTheDocument();
    // --- 30日: 総実行時間 (500000-450000=50000ms=50.0秒, +11.1%) ---
    expect(screen.getByText("前期間比 +50.0秒（+11.1%）")).toBeInTheDocument();
  });

  it("実データ: マシン負荷スパークライン（KB→byte換算・swap使用量計算）とDBサイズ合算、トレンド方向・参考値フラグを表示する", async () => {
    // スパークライン用の系列（getRecentMachineMetricsSeries）。
    // 末尾行の mem_available_kb / (swap_total_kb - swap_free_kb) がKB→byte換算されて表示される。
    getRecentMachineMetricsSeriesMock.mockReturnValue([
      {
        ts_utc: "2026-07-08T00:00:00.000Z",
        mem_available_kb: 300_000,
        mem_total_kb: 1_000_000,
        swap_total_kb: 500_000,
        swap_free_kb: 480_000,
      },
      {
        ts_utc: "2026-07-09T00:00:00.000Z",
        mem_available_kb: 320_000,
        mem_total_kb: 1_000_000,
        swap_total_kb: 500_000,
        swap_free_kb: 470_000,
      },
    ]);

    // トレンド用の系列（getMachineMetrics）。sampleCount=6 >= trendSampleMin(5)のため参考値扱いにならず、
    // MemAvailable/DBサイズともに明確な右肩上がりの値を与え increasing 判定を確認する。
    getMachineMetricsMock.mockReturnValue(
      [100_000, 110_000, 120_000, 130_000, 140_000, 150_000].map((memKb, i) =>
        machineMetricsRow({
          ts_utc: `2026-06-2${i}T00:00:00.000Z`,
          mem_available_kb: memKb,
          // 平均値の1%（flatとみなす許容誤差）を明確に上回る傾きにするため、
          // 200,000刻み（平均1,500,000の1% = 15,000 << 200,000）で増加させる。
          db_size_bytes: 1_000_000 + i * 200_000,
          wal_size_bytes: 0,
        }),
      ),
    );

    // 状態評価・ヘッダの「最終収集」・TrendIndicatorの直近値表示に使う最新1件。
    // スパークライン系列（getRecentMachineMetricsSeries）・トレンド系列（getMachineMetrics）とは
    // 別のクエリ結果であることを明示するため、値をあえて変えている
    // （実装が誤って同じ配列を使い回していないかを検出する）。
    getLatestMachineMetricsMock.mockReturnValue(
      machineMetricsRow({
        ts_utc: "2026-07-10T00:00:00.000Z",
        mem_available_kb: 1_048_576, // ちょうど1GB（KB→byte換算の検証用）
        mem_total_kb: 4_000_000,
        swap_total_kb: 2_000_000,
        swap_free_kb: 1_900_000, // used = 100,000KB（閾値未満で安全域）
        db_size_bytes: 2_000_000_000,
        wal_size_bytes: 0,
      }),
    );

    const { default: Page } = await import("../../src/app/page");
    render(<Page />);

    // --- ヘッダ: 最終収集時刻（JST変換） ---
    expect(
      screen.getByRole("heading", {
        name: `直近のマシン負荷（最終収集: ${formatJstDateTime("2026-07-10T00:00:00.000Z")}）`,
      }),
    ).toBeInTheDocument();

    // --- MachineSparklines: KB→byte換算（末尾値=320,000KB）とswap使用量（500,000-470,000=30,000KB） ---
    expect(screen.getByText(formatBytes(320_000 * 1024))).toBeInTheDocument();
    expect(screen.getByText(formatBytes((500_000 - 470_000) * 1024))).toBeInTheDocument();

    // --- TrendIndicator: 直近値はgetLatestMachineMetricsの値（getRecentMachineMetricsSeriesとは別系統） ---
    expect(screen.getByText(formatBytes(1_048_576 * 1024))).toBeInTheDocument(); // MemAvailable直近値 = "1.00 GB"
    expect(
      screen.getByText(formatBytes(2_000_000_000 + 0)), // DBサイズ直近値（db_size_bytes+wal_size_bytes）
    ).toBeInTheDocument();

    // --- トレンド方向: MemAvailable・DBサイズともにincreasing（右肩上がりのデータ） ---
    expect(screen.getAllByText("増加傾向")).toHaveLength(2);
    // --- 参考値フラグ: サンプル数6 >= trendSampleMin(5)のため非表示 ---
    // ("参考値"という文字列自体はカード見出し「参考値はサンプル不足を示す」にも含まれるため、
    //  TrendIndicatorの参考値バッジ特有の文言（"参考値（サンプルN件）"）で判定する)
    expect(screen.queryByText(/参考値（サンプル\d+件）/)).not.toBeInTheDocument();
  });

  it("状態バッジ: 閾値に達した指標のレベルラベルと判定根拠を表示する", async () => {
    // MemAvailable=150,000KBは warning(200,000)以下・danger(100,000)より大きいため注意（warning）判定。
    // スワップ使用量・DBサイズは閾値未満の安全域とし、MemAvailableのみが根拠になるようにする。
    getLatestMachineMetricsMock.mockReturnValue(
      machineMetricsRow({
        mem_available_kb: 150_000,
        swap_total_kb: 1_000_000,
        swap_free_kb: 999_000, // used = 1,000KB（安全域）
        db_size_bytes: 1_000_000,
        wal_size_bytes: 0,
      }),
    );

    const { default: Page } = await import("../../src/app/page");
    render(<Page />);

    const badge = screen.getByRole("status");
    expect(badge).toHaveTextContent("注意");
    expect(badge).toHaveAttribute(
      "title",
      "MemAvailable 150000KB が注意閾値 200000KB に達しています",
    );
    expect(
      screen.getByText("（MemAvailable 150000KB が注意閾値 200000KB に達しています）"),
    ).toBeInTheDocument();
  });

  it("マシン負荷データ未収集時は「判定不可」の案内とMemAvailable/DBサイズのトレンドは表示しない", async () => {
    getLatestMachineMetricsMock.mockReturnValue(undefined);

    const { default: Page } = await import("../../src/app/page");
    render(<Page />);

    expect(
      screen.getByText(
        "マシン負荷データがまだ収集されていません（状態評価・トレンドは判定不可）。",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("増加傾向")).not.toBeInTheDocument();
  });

  it("最終収集時刻をJSTで表示する", async () => {
    getLatestMachineMetricsMock.mockReturnValue(
      machineMetricsRow({ ts_utc: "2026-07-09T15:30:00.000Z" }), // JST 2026-07-10 00:30
    );

    const { default: Page } = await import("../../src/app/page");
    render(<Page />);

    expect(
      screen.getByRole("heading", {
        name: "直近のマシン負荷（最終収集: 2026-07-10 00:30）",
      }),
    ).toBeInTheDocument();
  });

  it("DbNotFoundError発生時はEmptyStateと/syncへのリンクを表示する", async () => {
    getDbMock.mockImplementation(() => {
      throw new FakeDbNotFoundError("db not found");
    });

    const { default: Page } = await import("../../src/app/page");
    render(<Page />);

    expect(screen.getByRole("heading", { name: "ダッシュボード" })).toBeInTheDocument();
    expect(screen.getByText("まだ同期されていません")).toBeInTheDocument();
    expect(
      screen.getByText("npm run sync を実行するか、同期画面から実行してください。"),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "同期画面へ" });
    expect(link).toHaveAttribute("href", "/sync");

    // DbNotFoundError発生時はクエリ層を呼び出さない
    expect(getInsightsSummaryMock).not.toHaveBeenCalled();
  });

  it("DbNotFoundError以外の例外は再スローする", async () => {
    getDbMock.mockImplementation(() => {
      throw new Error("unexpected db error");
    });

    const { default: Page } = await import("../../src/app/page");
    expect(() => render(<Page />)).toThrow("unexpected db error");
  });
});
