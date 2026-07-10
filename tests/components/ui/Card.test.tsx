import { render, screen } from "@testing-library/react";
import { Card } from "@/components/ui/Card";

describe("Card", () => {
  it("titleを指定した場合、見出しとして表示する", () => {
    render(
      <Card title="サマリ">
        <p>本文</p>
      </Card>,
    );

    expect(
      screen.getByRole("heading", { name: "サマリ" }),
    ).toBeInTheDocument();
  });

  it("titleを省略した場合、見出しを表示しない", () => {
    render(
      <Card>
        <p>本文</p>
      </Card>,
    );

    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("childrenの内容を表示する", () => {
    render(
      <Card title="サマリ">
        <p>子要素のテキスト</p>
      </Card>,
    );

    expect(screen.getByText("子要素のテキスト")).toBeInTheDocument();
  });
});
