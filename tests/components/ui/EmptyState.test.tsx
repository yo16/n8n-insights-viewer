import { render, screen } from "@testing-library/react";
import { EmptyState } from "@/components/ui/EmptyState";

describe("EmptyState", () => {
  it("messageを表示する", () => {
    render(<EmptyState message="まだ同期されていません。" />);

    expect(
      screen.getByText("まだ同期されていません。"),
    ).toBeInTheDocument();
  });

  it("titleを指定した場合、見出しとして表示する", () => {
    render(
      <EmptyState title="データがありません" message="同期してください。" />,
    );

    expect(screen.getByText("データがありません")).toBeInTheDocument();
    expect(screen.getByText("同期してください。")).toBeInTheDocument();
  });

  it("titleを省略した場合、見出しを表示しない", () => {
    render(<EmptyState message="同期してください。" />);

    expect(screen.queryByText("データがありません")).not.toBeInTheDocument();
  });

  it("childrenで渡したアクションを表示する", () => {
    render(
      <EmptyState message="同期してください。">
        <button type="button">同期画面へ</button>
      </EmptyState>,
    );

    expect(
      screen.getByRole("button", { name: "同期画面へ" }),
    ).toBeInTheDocument();
  });

  it("role=statusが設定されている", () => {
    render(<EmptyState message="同期してください。" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
