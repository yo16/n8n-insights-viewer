import { render, screen } from "@testing-library/react";
import { Sparkline } from "@/components/charts/Sparkline";

const data = [
  { key: "2026-07-01", value: 10 },
  { key: "2026-07-02", value: null },
  { key: "2026-07-03", value: 30 },
];

describe("Sparkline", () => {
  it("role=imgでラッパーを描画し、ariaLabelをaria-labelに設定する", () => {
    render(<Sparkline data={data} ariaLabel="メモリ使用量の推移" />);

    const el = screen.getByRole("img", { name: "メモリ使用量の推移" });
    expect(el).toBeInTheDocument();
  });

  it("ariaLabel省略時、aria-labelは付与されない", () => {
    const { container } = render(<Sparkline data={data} />);

    const el = container.querySelector('[role="img"]');
    expect(el).not.toHaveAttribute("aria-label");
  });

  it("heightとwidthを指定した場合、ラッパーのインラインスタイルに反映する", () => {
    render(<Sparkline data={data} height={60} width={200} ariaLabel="test" />);

    const el = screen.getByRole("img", { name: "test" });
    expect(el).toHaveStyle({ height: "60px", width: "200px" });
  });

  it("height/width省略時は既定値（40px, 100%）を使う", () => {
    render(<Sparkline data={data} ariaLabel="test" />);

    const el = screen.getByRole("img", { name: "test" });
    expect(el).toHaveStyle({ height: "40px", width: "100%" });
  });
});
