import { render, screen } from "@testing-library/react";
import { TrendIndicator } from "@/components/machine/TrendIndicator";

describe("TrendIndicator", () => {
  it("labelと方向ラベル(増加)を表示する", () => {
    render(
      <TrendIndicator
        label="MemAvailable"
        direction="increasing"
        isReference={false}
        sampleCount={10}
      />,
    );

    expect(screen.getByText("MemAvailable")).toBeInTheDocument();
    expect(screen.getByText("増加")).toBeInTheDocument();
  });

  it("横ばい方向のラベルを表示する", () => {
    render(
      <TrendIndicator label="DBサイズ" direction="flat" isReference={false} sampleCount={10} />,
    );

    expect(screen.getByText("横ばい")).toBeInTheDocument();
  });

  it("減少方向のラベルを表示する", () => {
    render(
      <TrendIndicator
        label="MemAvailable"
        direction="decreasing"
        isReference={false}
        sampleCount={10}
      />,
    );

    expect(screen.getByText("減少")).toBeInTheDocument();
  });

  it("isReference=trueの場合、「参考値」バッジを表示する", () => {
    render(
      <TrendIndicator label="MemAvailable" direction="flat" isReference={true} sampleCount={2} />,
    );

    expect(screen.getByText("参考値")).toBeInTheDocument();
    expect(screen.getByTitle("有効サンプル数 2 件のため参考値です")).toBeInTheDocument();
  });

  it("isReference=falseの場合、「参考値」バッジを表示しない", () => {
    render(
      <TrendIndicator label="MemAvailable" direction="flat" isReference={false} sampleCount={10} />,
    );

    expect(screen.queryByText("参考値")).not.toBeInTheDocument();
  });
});
