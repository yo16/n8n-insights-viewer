import { render, screen } from "@testing-library/react";
import { usePathname } from "next/navigation";
import { Nav } from "@/components/layout/Nav";
import { NAV_LINKS } from "@/components/layout/nav-links";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
}));

const mockedUsePathname = usePathname as jest.Mock;

describe("Nav", () => {
  it("nav要素にアクセシブルなラベルが設定されている", () => {
    mockedUsePathname.mockReturnValue("/");

    render(<Nav />);

    expect(
      screen.getByRole("navigation", { name: "画面ナビゲーション" }),
    ).toBeInTheDocument();
  });

  it("6画面すべてのリンクが表示され、正しいhrefを持つ", () => {
    mockedUsePathname.mockReturnValue("/");

    render(<Nav />);

    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(NAV_LINKS.length);
    expect(links).toHaveLength(6);

    for (const navLink of NAV_LINKS) {
      const link = screen.getByRole("link", { name: navLink.label });
      expect(link).toHaveAttribute("href", navLink.href);
    }
  });

  it.each(NAV_LINKS.map((link) => [link.href, link.label]))(
    "現在のパスが%sのとき、対応するリンク（%s）にaria-current=pageが付与される",
    (href, label) => {
      mockedUsePathname.mockReturnValue(href);

      render(<Nav />);

      const activeLink = screen.getByRole("link", { name: label });
      expect(activeLink).toHaveAttribute("aria-current", "page");

      const otherLinks = NAV_LINKS.filter((link) => link.href !== href);
      for (const other of otherLinks) {
        const link = screen.getByRole("link", { name: other.label });
        expect(link).not.toHaveAttribute("aria-current");
      }
    },
  );

  it("現在パスがどのリンクにも一致しない場合、どのリンクにもaria-currentが付与されない", () => {
    mockedUsePathname.mockReturnValue("/unknown-page");

    render(<Nav />);

    for (const navLink of NAV_LINKS) {
      const link = screen.getByRole("link", { name: navLink.label });
      expect(link).not.toHaveAttribute("aria-current");
    }
  });
});
