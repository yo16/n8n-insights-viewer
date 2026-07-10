import { render, screen } from "@testing-library/react";
import { StatusBadge, type Status } from "@/components/ui/StatusBadge";

describe("StatusBadge", () => {
  const cases: Array<{ status: Status; label: string }> = [
    { status: "normal", label: "正常" },
    { status: "warning", label: "注意" },
    { status: "danger", label: "危険" },
  ];

  it.each(cases)(
    "status=$status のとき、role=statusでラベル「$label」を表示する",
    ({ status, label }) => {
      render(<StatusBadge status={status} />);

      const badge = screen.getByRole("status");
      expect(badge).toHaveTextContent(label);
    },
  );

  it("reasonを指定した場合、判定根拠が併記されtitle属性に設定される", () => {
    render(<StatusBadge status="danger" reason="MemAvailable 320MB" />);

    const badge = screen.getByRole("status");
    expect(badge).toHaveTextContent("MemAvailable 320MB");
    expect(badge).toHaveAttribute("title", "MemAvailable 320MB");
  });

  it("reasonを指定しない場合、判定根拠の表示もtitle属性もない", () => {
    render(<StatusBadge status="normal" />);

    const badge = screen.getByRole("status");
    expect(badge).not.toHaveAttribute("title");
    expect(badge).toHaveTextContent("正常");
    expect(badge.textContent).not.toContain("（");
  });
});
