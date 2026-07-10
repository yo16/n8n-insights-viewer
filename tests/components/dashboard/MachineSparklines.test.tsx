import { render, screen } from "@testing-library/react";
import { MachineSparklines } from "@/components/dashboard/MachineSparklines";
import type { SparklinePoint } from "@/components/charts/Sparkline";

/**
 * MachineSparklinesの単体テスト。
 *
 * recharts（Sparkline内部）はjsdom上でResponsiveContainerの実寸が0になるため、
 * 描画されたグラフの形状までは検証せず、構造（タイトル・最終値・空データ時の
 * フォールバック表示）のみを検証する。
 */
describe("MachineSparklines", () => {
  it("データが空の場合、空状態メッセージを表示する", () => {
    render(<MachineSparklines memAvailableSeries={[]} swapUsedSeries={[]} />);

    expect(
      screen.getByText("マシン負荷データがありません。"),
    ).toBeInTheDocument();
  });

  it("データがある場合、MemAvailableとスワップ使用量のタイトルを表示する", () => {
    const memAvailableSeries: SparklinePoint[] = [
      { key: "2026-07-08", value: 300 * 1024 * 1024, timestampUtc: "2026-07-08T00:00:00Z" },
      { key: "2026-07-09", value: 320 * 1024 * 1024, timestampUtc: "2026-07-09T00:00:00Z" },
    ];
    const swapUsedSeries: SparklinePoint[] = [
      { key: "2026-07-08", value: 10 * 1024 * 1024, timestampUtc: "2026-07-08T00:00:00Z" },
      { key: "2026-07-09", value: 12 * 1024 * 1024, timestampUtc: "2026-07-09T00:00:00Z" },
    ];

    render(
      <MachineSparklines
        memAvailableSeries={memAvailableSeries}
        swapUsedSeries={swapUsedSeries}
      />,
    );

    expect(screen.getByText("MemAvailable")).toBeInTheDocument();
    expect(screen.getByText("スワップ使用量")).toBeInTheDocument();
  });

  it("直近値を末尾の非null値からformatBytesで整形して表示する", () => {
    const memAvailableSeries: SparklinePoint[] = [
      { key: "2026-07-08", value: 300 * 1024 * 1024, timestampUtc: "2026-07-08T00:00:00Z" },
      { key: "2026-07-09", value: null, timestampUtc: "2026-07-09T00:00:00Z" },
    ];
    const swapUsedSeries: SparklinePoint[] = [
      { key: "2026-07-08", value: 10 * 1024 * 1024, timestampUtc: "2026-07-08T00:00:00Z" },
      { key: "2026-07-09", value: 12 * 1024 * 1024, timestampUtc: "2026-07-09T00:00:00Z" },
    ];

    render(
      <MachineSparklines
        memAvailableSeries={memAvailableSeries}
        swapUsedSeries={swapUsedSeries}
      />,
    );

    // 末尾がnullでも、その前の非null値（300MB）を最新値として表示する
    expect(screen.getByText("300.0 MB")).toBeInTheDocument();
    expect(screen.getByText("12.0 MB")).toBeInTheDocument();
  });

  it("系列がすべてnullの場合、最新値は'-'で表示する", () => {
    const memAvailableSeries: SparklinePoint[] = [
      { key: "2026-07-08", value: null, timestampUtc: "2026-07-08T00:00:00Z" },
    ];
    const swapUsedSeries: SparklinePoint[] = [
      { key: "2026-07-08", value: null, timestampUtc: "2026-07-08T00:00:00Z" },
    ];

    render(
      <MachineSparklines
        memAvailableSeries={memAvailableSeries}
        swapUsedSeries={swapUsedSeries}
      />,
    );

    const dashes = screen.getAllByText("-");
    expect(dashes).toHaveLength(2);
  });

  it("データがある場合、role=imgのグラフを2つ描画する（MemAvailable/スワップ使用量）", () => {
    const series: SparklinePoint[] = [
      { key: "2026-07-08", value: 100, timestampUtc: "2026-07-08T00:00:00Z" },
    ];

    render(<MachineSparklines memAvailableSeries={series} swapUsedSeries={series} />);

    expect(
      screen.getByRole("img", { name: "MemAvailableの直近推移" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: "スワップ使用量の直近推移" }),
    ).toBeInTheDocument();
  });
});
