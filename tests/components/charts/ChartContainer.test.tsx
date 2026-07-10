import { render, screen } from "@testing-library/react";
import { ChartContainer } from "@/components/charts/ChartContainer";

describe("ChartContainer", () => {
  it("titleを指定した場合、見出しとして表示する", () => {
    render(
      <ChartContainer title="実行時間の推移">
        <div>chart-body</div>
      </ChartContainer>,
    );

    expect(screen.getByRole("heading", { name: "実行時間の推移" })).toBeInTheDocument();
  });

  it("titleを省略した場合、見出しは表示されない", () => {
    render(
      <ChartContainer>
        <div>chart-body</div>
      </ChartContainer>,
    );

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("legendを指定した場合、ラベルと色チップを一覧表示する", () => {
    render(
      <ChartContainer
        legend={[
          { label: "実行時間", color: "var(--series-runtime)" },
          { label: "推定値", color: "var(--series-estimate)", strokeDasharray: "4 4" },
        ]}
      >
        <div>chart-body</div>
      </ChartContainer>,
    );

    expect(screen.getByText("実行時間")).toBeInTheDocument();
    expect(screen.getByText("推定値")).toBeInTheDocument();
  });

  it("legendが空配列の場合、凡例リストを表示しない", () => {
    const { container } = render(
      <ChartContainer legend={[]}>
        <div>chart-body</div>
      </ChartContainer>,
    );

    expect(container.querySelector("ul")).not.toBeInTheDocument();
  });

  it("title・legendともに省略した場合、ヘッダー自体を表示しない", () => {
    render(
      <ChartContainer>
        <div>chart-body</div>
      </ChartContainer>,
    );

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("footnoteを指定した場合、注記を表示する", () => {
    render(
      <ChartContainer footnote={<p>この期間はUTC区切りの近似値です</p>}>
        <div>chart-body</div>
      </ChartContainer>,
    );

    expect(screen.getByText("この期間はUTC区切りの近似値です")).toBeInTheDocument();
  });

  it("footnoteを省略した場合、注記領域を表示しない", () => {
    const { container } = render(
      <ChartContainer>
        <div>chart-body</div>
      </ChartContainer>,
    );

    expect(container.querySelector(".footnote")).not.toBeInTheDocument();
  });

  it("heightを指定した場合、本体divのインラインスタイルに反映する", () => {
    const { container } = render(
      <ChartContainer height={400}>
        <div>chart-body</div>
      </ChartContainer>,
    );

    const body = container.querySelector(".body");
    expect(body).toHaveStyle({ height: "400px" });
  });

  it("heightを省略した場合、既定値280pxを使う", () => {
    const { container } = render(
      <ChartContainer>
        <div>chart-body</div>
      </ChartContainer>,
    );

    const body = container.querySelector(".body");
    expect(body).toHaveStyle({ height: "280px" });
  });

  it("childrenをそのまま描画する", () => {
    render(
      <ChartContainer>
        <div>chart-body-content</div>
      </ChartContainer>,
    );

    expect(screen.getByText("chart-body-content")).toBeInTheDocument();
  });
});
