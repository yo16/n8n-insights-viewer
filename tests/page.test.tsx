import { render, screen } from "@testing-library/react";
import Page from "@/app/page";

describe("Home page", () => {
  it("プロジェクト名の見出しを表示する", () => {
    render(<Page />);

    const heading = screen.getByRole("heading", { level: 1 });
    expect(heading).toHaveTextContent("n8n Insights Viewer");
  });
});
