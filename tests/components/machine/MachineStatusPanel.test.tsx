import { render, screen } from "@testing-library/react";
import { MachineStatusPanel } from "@/components/machine/MachineStatusPanel";
import type { StatusResult, TrendResult } from "@/lib/aggregation";

const flatTrend: TrendResult = { direction: "flat", slope: 0, sampleCount: 10, isReference: false };

describe("MachineStatusPanel", () => {
  it("正常状態のバッジを表示し、判定根拠のtitleは付けない", () => {
    const status: StatusResult = { level: "normal", reasons: [] };
    render(
      <MachineStatusPanel
        status={status}
        memAvailableTrend={flatTrend}
        dbSizeTrend={flatTrend}
      />,
    );

    expect(screen.getByText("正常")).toBeInTheDocument();
  });

  it("危険状態の場合、判定根拠をtitle属性として結合して付与する", () => {
    const status: StatusResult = {
      level: "danger",
      reasons: ["MemAvailable 1000KB が危険閾値 102400KB に達しています", "スワップ使用量 2000000KB が危険閾値 1572864KB に達しています"],
    };
    render(
      <MachineStatusPanel
        status={status}
        memAvailableTrend={flatTrend}
        dbSizeTrend={flatTrend}
      />,
    );

    expect(screen.getByText("危険")).toBeInTheDocument();
    const badge = screen.getAllByRole("status")[0];
    expect(badge).toHaveAttribute(
      "title",
      "MemAvailable 1000KB が危険閾値 102400KB に達しています / スワップ使用量 2000000KB が危険閾値 1572864KB に達しています",
    );
  });

  it("MemAvailableとDBサイズのトレンドをそれぞれ表示する", () => {
    const status: StatusResult = { level: "normal", reasons: [] };
    render(
      <MachineStatusPanel
        status={status}
        memAvailableTrend={{ direction: "decreasing", slope: -1, sampleCount: 10, isReference: false }}
        dbSizeTrend={{ direction: "increasing", slope: 1, sampleCount: 10, isReference: false }}
      />,
    );

    expect(screen.getByText("MemAvailable")).toBeInTheDocument();
    expect(screen.getByText("減少")).toBeInTheDocument();
    expect(screen.getByText("DBサイズ")).toBeInTheDocument();
    expect(screen.getByText("増加")).toBeInTheDocument();
  });
});
