import { render, screen } from "@testing-library/react";
import { RangeFilter } from "@/components/machine/RangeFilter";

describe("RangeFilter", () => {
  it("24時間/7日/30日の3つのタブリンクを表示する", () => {
    render(<RangeFilter current="7d" />);

    expect(screen.getByRole("link", { name: "24時間" })).toHaveAttribute(
      "href",
      "/machine?range=24h",
    );
    expect(screen.getByRole("link", { name: "7日" })).toHaveAttribute(
      "href",
      "/machine?range=7d",
    );
    expect(screen.getByRole("link", { name: "30日" })).toHaveAttribute(
      "href",
      "/machine?range=30d",
    );
  });

  it("currentに一致するタブにaria-current=pageを付与する", () => {
    render(<RangeFilter current="24h" />);

    expect(screen.getByRole("link", { name: "24時間" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "7日" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "30日" })).not.toHaveAttribute("aria-current");
  });

  it("currentが変わればaria-currentの対象も変わる", () => {
    render(<RangeFilter current="30d" />);

    expect(screen.getByRole("link", { name: "30日" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "24時間" })).not.toHaveAttribute("aria-current");
  });
});
