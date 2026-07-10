import { render, screen } from "@testing-library/react";
import { MetricTile } from "@/components/dashboard/MetricTile";

describe("MetricTile", () => {
  it("labelとvalueを表示する", () => {
    render(<MetricTile label="総実行数" value="1,234" />);

    expect(screen.getByText("総実行数")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
  });

  it("deltaを指定した場合、前期間比として表示する", () => {
    render(<MetricTile label="総実行数" value="1,234" delta="+12（+8.3%）" />);

    expect(screen.getByText("前期間比 +12（+8.3%）")).toBeInTheDocument();
  });

  it("deltaを省略した場合、前期間比を表示しない", () => {
    render(<MetricTile label="総実行数" value="1,234" />);

    expect(screen.queryByText(/前期間比/)).not.toBeInTheDocument();
  });
});
