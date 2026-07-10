import { render, screen } from "@testing-library/react";
import { TimeSeriesChart } from "@/components/charts/TimeSeriesChart";
import type { ChartSeries, TimeSeriesDatum } from "@/components/charts/types";

/**
 * Rechartsの内部SVG描画はjsdom上（ResponsiveContainerが幅0になる）では検証できないため、
 * ここでは`ChartContainer`経由の構造（タイトル・凡例・UTC近似注記の条件表示）のみを検証する。
 * 閾値線・イベントマーカー・connectNulls等の実描画確認はE2Eの領域とする。
 */

const series: ChartSeries[] = [
  { dataKey: "runtime", name: "実行時間", color: "var(--series-runtime)", unit: "ms" },
];

const data: TimeSeriesDatum[] = [
  { key: "2026-07-01", runtime: 100 },
  { key: "2026-07-02", runtime: 200 },
];

describe("TimeSeriesChart", () => {
  it("titleを指定した場合、見出しとして表示する", () => {
    render(<TimeSeriesChart data={data} series={series} title="実行時間の推移" />);

    expect(screen.getByRole("heading", { name: "実行時間の推移" })).toBeInTheDocument();
  });

  it("legend省略時、seriesから自動生成した凡例を表示する", () => {
    render(<TimeSeriesChart data={data} series={series} />);

    expect(screen.getByText("実行時間")).toBeInTheDocument();
  });

  it("legend=falseの場合、凡例を表示しない", () => {
    render(<TimeSeriesChart data={data} series={series} legend={false} />);

    expect(screen.queryByText("実行時間")).not.toBeInTheDocument();
  });

  it("legendを明示指定した場合、その内容で表示する", () => {
    render(
      <TimeSeriesChart
        data={data}
        series={series}
        legend={[{ label: "カスタム凡例", color: "var(--series-runtime)" }]}
      />,
    );

    expect(screen.getByText("カスタム凡例")).toBeInTheDocument();
    expect(screen.queryByText("実行時間")).not.toBeInTheDocument();
  });

  it("dataにisApprox:trueを含む場合、UTC近似注記を表示する", () => {
    const approxData: TimeSeriesDatum[] = [
      { key: "2026-07-01", runtime: 100, isApprox: true },
      { key: "2026-07-02", runtime: 200 },
    ];
    render(<TimeSeriesChart data={approxData} series={series} />);

    expect(
      screen.getByText(
        "この期間の日次値はUTC区切りの近似値です（JSTとは最大9時間ずれる場合があります）。",
      ),
    ).toBeInTheDocument();
  });

  it("dataにisApproxを含まない場合、UTC近似注記を表示しない", () => {
    render(<TimeSeriesChart data={data} series={series} />);

    expect(
      screen.queryByText(
        "この期間の日次値はUTC区切りの近似値です（JSTとは最大9時間ずれる場合があります）。",
      ),
    ).not.toBeInTheDocument();
  });

  it("footnoteを指定した場合、注記としてUTC近似注記の後に表示する", () => {
    render(
      <TimeSeriesChart
        data={data}
        series={series}
        footnote={<span>追加の注記</span>}
      />,
    );

    expect(screen.getByText("追加の注記")).toBeInTheDocument();
  });

  it("isApproxもfootnoteも無い場合、注記領域自体を表示しない", () => {
    const { container } = render(<TimeSeriesChart data={data} series={series} />);

    expect(container.querySelector(".footnote")).not.toBeInTheDocument();
  });
});
