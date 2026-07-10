import { render, screen } from "@testing-library/react";
import { PeriodSummaryCard } from "@/components/dashboard/PeriodSummaryCard";
import type { MetricTileProps } from "@/components/dashboard/MetricTile";

const metrics: MetricTileProps[] = [
  { label: "総実行数", value: "1,234", delta: "+12（+8.3%）" },
  { label: "成功率", value: "80.0%", delta: "+2.3pt" },
  { label: "失敗数", value: "20" },
  { label: "総実行時間", value: "1.5分" },
];

describe("PeriodSummaryCard", () => {
  it("titleを見出しとして表示する", () => {
    render(<PeriodSummaryCard title="直近7日" metrics={metrics} />);

    expect(screen.getByRole("heading", { name: "直近7日" })).toBeInTheDocument();
  });

  it("4つのタイルをすべて表示する", () => {
    render(<PeriodSummaryCard title="直近7日" metrics={metrics} />);

    expect(screen.getByText("総実行数")).toBeInTheDocument();
    expect(screen.getByText("成功率")).toBeInTheDocument();
    expect(screen.getByText("失敗数")).toBeInTheDocument();
    expect(screen.getByText("総実行時間")).toBeInTheDocument();
  });

  it("各タイルの値と前期間比を表示する", () => {
    render(<PeriodSummaryCard title="直近7日" metrics={metrics} />);

    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("前期間比 +12（+8.3%）")).toBeInTheDocument();
    expect(screen.getByText("前期間比 +2.3pt")).toBeInTheDocument();
  });

  it("metricsが空の場合はタイルを描画しない", () => {
    render(<PeriodSummaryCard title="直近7日" metrics={[]} />);

    expect(screen.getByRole("heading", { name: "直近7日" })).toBeInTheDocument();
    expect(screen.queryByText(/前期間比/)).not.toBeInTheDocument();
  });
});
