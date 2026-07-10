import { render, screen } from "@testing-library/react";
import { CategoryBarChart } from "@/components/charts/CategoryBarChart";
import type { CategoryDatum, ChartSeries } from "@/components/charts/types";

/**
 * TimeSeriesChart同様、Rechartsの内部SVG描画はjsdomでは検証できないため、
 * `ChartContainer`経由の構造（タイトル・凡例の自動生成/抑制）のみを検証する。
 */

const data: CategoryDatum[] = [
  { key: "wf-1", label: "ワークフローA", count: 10 },
  { key: "wf-2", label: "ワークフローB", count: 20 },
];

describe("CategoryBarChart", () => {
  it("titleを指定した場合、見出しとして表示する", () => {
    const series: ChartSeries[] = [{ dataKey: "count", name: "件数", color: "var(--series-count)" }];
    render(<CategoryBarChart data={data} series={series} title="ワークフロー別件数" />);

    expect(screen.getByRole("heading", { name: "ワークフロー別件数" })).toBeInTheDocument();
  });

  it("単一系列の場合、legend省略時は凡例を自動表示しない", () => {
    const series: ChartSeries[] = [{ dataKey: "count", name: "件数", color: "var(--series-count)" }];
    const { container } = render(<CategoryBarChart data={data} series={series} />);

    expect(container.querySelector("ul")).not.toBeInTheDocument();
  });

  it("複数系列の場合、legend省略時はseriesから自動生成した凡例を表示する", () => {
    const series: ChartSeries[] = [
      { dataKey: "success", name: "成功", color: "var(--series-success)" },
      { dataKey: "failure", name: "失敗", color: "var(--series-failure)" },
    ];
    render(<CategoryBarChart data={data} series={series} />);

    expect(screen.getByText("成功")).toBeInTheDocument();
    expect(screen.getByText("失敗")).toBeInTheDocument();
  });

  it("legend=falseの場合、複数系列でも凡例を表示しない", () => {
    const series: ChartSeries[] = [
      { dataKey: "success", name: "成功", color: "var(--series-success)" },
      { dataKey: "failure", name: "失敗", color: "var(--series-failure)" },
    ];
    const { container } = render(<CategoryBarChart data={data} series={series} legend={false} />);

    expect(container.querySelector("ul")).not.toBeInTheDocument();
  });

  it("legendを明示指定した場合、その内容で表示する", () => {
    const series: ChartSeries[] = [{ dataKey: "count", name: "件数", color: "var(--series-count)" }];
    render(
      <CategoryBarChart
        data={data}
        series={series}
        legend={[{ label: "カスタム凡例", color: "var(--series-count)" }]}
      />,
    );

    expect(screen.getByText("カスタム凡例")).toBeInTheDocument();
  });
});
