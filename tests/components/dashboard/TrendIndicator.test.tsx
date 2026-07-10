import { render, screen } from "@testing-library/react";
import { TrendIndicator } from "@/components/dashboard/TrendIndicator";

describe("TrendIndicator", () => {
  it("increasing方向は↑と増加傾向を表示する", () => {
    render(
      <TrendIndicator
        label="MemAvailable"
        direction="increasing"
        isReference={false}
        sampleCount={20}
      />,
    );

    expect(screen.getByText("増加傾向")).toBeInTheDocument();
  });

  it("flat方向は→と横ばいを表示する", () => {
    render(
      <TrendIndicator
        label="MemAvailable"
        direction="flat"
        isReference={false}
        sampleCount={20}
      />,
    );

    expect(screen.getByText("横ばい")).toBeInTheDocument();
  });

  it("decreasing方向は↓と減少傾向を表示する", () => {
    render(
      <TrendIndicator
        label="MemAvailable"
        direction="decreasing"
        isReference={false}
        sampleCount={20}
      />,
    );

    expect(screen.getByText("減少傾向")).toBeInTheDocument();
  });

  it("currentValueLabelを指定した場合、直近値を表示する", () => {
    render(
      <TrendIndicator
        label="MemAvailable"
        currentValueLabel="320 MB"
        direction="flat"
        isReference={false}
        sampleCount={20}
      />,
    );

    expect(screen.getByText("320 MB")).toBeInTheDocument();
  });

  it("currentValueLabelを省略した場合、直近値を表示しない", () => {
    render(
      <TrendIndicator
        label="MemAvailable"
        direction="flat"
        isReference={false}
        sampleCount={20}
      />,
    );

    expect(screen.queryByText("320 MB")).not.toBeInTheDocument();
    // ラベルと方向のみが表示され、値のspanは追加されない
    expect(screen.getByText("MemAvailable")).toBeInTheDocument();
    expect(screen.getByText("横ばい")).toBeInTheDocument();
  });

  it("isReference:trueの場合、参考値とサンプル数を表示する", () => {
    render(
      <TrendIndicator
        label="MemAvailable"
        direction="flat"
        isReference={true}
        sampleCount={3}
      />,
    );

    expect(screen.getByText("参考値（サンプル3件）")).toBeInTheDocument();
  });

  it("isReference:falseの場合、参考値表示をしない", () => {
    render(
      <TrendIndicator
        label="MemAvailable"
        direction="flat"
        isReference={false}
        sampleCount={20}
      />,
    );

    expect(screen.queryByText(/参考値/)).not.toBeInTheDocument();
  });
});
