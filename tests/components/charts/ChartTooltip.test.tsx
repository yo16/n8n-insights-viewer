import { render, screen } from "@testing-library/react";
import { CategoryChartTooltip, ChartTooltip } from "@/components/charts/ChartTooltip";
import type { ChartSeries } from "@/components/charts/types";

const series: ChartSeries[] = [
  { dataKey: "runtime", name: "実行時間", color: "var(--series-runtime)", unit: "ms" },
  { dataKey: "count", name: "件数", color: "var(--series-count)", unit: "count" },
];

describe("ChartTooltip", () => {
  it("activeがfalseの場合は何も表示しない", () => {
    const { container } = render(
      <ChartTooltip
        active={false}
        label="2026-07-10"
        payload={[{ dataKey: "runtime", value: 1500, payload: { key: "2026-07-10", runtime: 1500 } }]}
        series={series}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("payloadが空の場合は何も表示しない", () => {
    const { container } = render(
      <ChartTooltip active label="2026-07-10" payload={[]} series={series} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("timestampUtcがある場合、JST時刻ヘッダを表示する", () => {
    render(
      <ChartTooltip
        active
        label="2026-07-10"
        payload={[
          {
            dataKey: "runtime",
            value: 1500,
            payload: { key: "2026-07-10", timestampUtc: "2026-07-10T00:30:00Z", runtime: 1500 },
          },
        ]}
        series={series}
      />,
    );

    expect(screen.getByText("2026-07-10 09:30 (JST)")).toBeInTheDocument();
  });

  it("timestampUtcがない場合、labelをフォールバックとして整形表示する", () => {
    render(
      <ChartTooltip
        active
        label="2026-07-10"
        payload={[{ dataKey: "runtime", value: 1500, payload: { key: "2026-07-10", runtime: 1500 } }]}
        series={series}
      />,
    );

    expect(screen.getByText("2026-07-10 (JST)")).toBeInTheDocument();
  });

  it("系列ごとに単位変換した値を表示する（msは秒/分表記）", () => {
    render(
      <ChartTooltip
        active
        label="2026-07-10"
        payload={[
          { dataKey: "runtime", value: 1500, payload: { key: "2026-07-10", runtime: 1500, count: 10 } },
          { dataKey: "count", value: 10, payload: { key: "2026-07-10", runtime: 1500, count: 10 } },
        ]}
        series={series}
      />,
    );

    expect(screen.getByText("実行時間")).toBeInTheDocument();
    expect(screen.getByText("1.5秒")).toBeInTheDocument();
    expect(screen.getByText("件数")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
  });

  it("値がnullの場合「-」を表示する（ゼロ埋めしない）", () => {
    render(
      <ChartTooltip
        active
        label="2026-07-10"
        payload={[{ dataKey: "runtime", value: null, payload: { key: "2026-07-10", runtime: null } }]}
        series={series}
      />,
    );

    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("dataKeyに対応するseries定義が無い場合、dataKeyをそのまま名前として表示する", () => {
    render(
      <ChartTooltip
        active
        label="2026-07-10"
        payload={[{ dataKey: "unknown", value: 5, payload: { key: "2026-07-10", unknown: 5 } }]}
        series={series}
      />,
    );

    expect(screen.getByText("unknown")).toBeInTheDocument();
  });

  it("isApproxがtrueの場合、UTC近似注記を表示する", () => {
    render(
      <ChartTooltip
        active
        label="2026-07-10"
        payload={[
          {
            dataKey: "runtime",
            value: 1500,
            payload: { key: "2026-07-10", runtime: 1500, isApprox: true },
          },
        ]}
        series={series}
      />,
    );

    expect(screen.getByText("UTC区切りの近似値")).toBeInTheDocument();
  });

  it("isApproxがない場合、UTC近似注記を表示しない", () => {
    render(
      <ChartTooltip
        active
        label="2026-07-10"
        payload={[{ dataKey: "runtime", value: 1500, payload: { key: "2026-07-10", runtime: 1500 } }]}
        series={series}
      />,
    );

    expect(screen.queryByText("UTC区切りの近似値")).not.toBeInTheDocument();
  });
});

describe("CategoryChartTooltip", () => {
  it("activeがfalseの場合は何も表示しない", () => {
    const { container } = render(
      <CategoryChartTooltip
        active={false}
        payload={[{ dataKey: "count", value: 5, payload: { key: "wf-1", label: "ワークフローA", count: 5 } }]}
        series={series}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("見出しにカテゴリ名（label）を表示する（時刻表示はしない）", () => {
    render(
      <CategoryChartTooltip
        active
        payload={[{ dataKey: "count", value: 5, payload: { key: "wf-1", label: "ワークフローA", count: 5 } }]}
        series={series}
      />,
    );

    expect(screen.getByText("ワークフローA")).toBeInTheDocument();
    expect(screen.queryByText(/JST/)).not.toBeInTheDocument();
  });

  it("値がnullの場合「-」を表示する", () => {
    render(
      <CategoryChartTooltip
        active
        payload={[{ dataKey: "count", value: null, payload: { key: "wf-1", label: "ワークフローA", count: null } }]}
        series={series}
      />,
    );

    expect(screen.getByText("-")).toBeInTheDocument();
  });
});
