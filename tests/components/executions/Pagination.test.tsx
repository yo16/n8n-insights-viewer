import { render, screen } from "@testing-library/react";
import { Pagination } from "../../../src/components/executions/Pagination";
import type { ExecutionsFilterState } from "../../../src/components/executions/queryParams";

/**
 * src/components/executions/Pagination.tsx の単体テスト。
 * リンクhref生成・境界（1ページ目/最終ページ）（画面4: ページネーション）
 */
function makeState(overrides: Partial<ExecutionsFilterState> = {}): ExecutionsFilterState {
  return {
    status: undefined,
    mode: undefined,
    workflowId: undefined,
    since: undefined,
    until: undefined,
    page: 1,
    ...overrides,
  };
}

describe("Pagination", () => {
  it("総ページ数が1以下の場合は何も表示しない", () => {
    const { container } = render(
      <Pagination current={makeState()} totalCount={10} pageSize={20} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("totalCount=0の場合も何も表示しない", () => {
    const { container } = render(
      <Pagination current={makeState()} totalCount={0} pageSize={20} />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it("1ページ目（先頭）の場合、「前へ」は無効化されたspanになりリンクは生成されない", () => {
    render(
      <Pagination current={makeState({ page: 1 })} totalCount={50} pageSize={20} />,
    );

    const prevSpan = screen.getByText("前へ");
    expect(prevSpan.tagName).toBe("SPAN");
    expect(prevSpan).toHaveAttribute("aria-disabled", "true");

    const nextLink = screen.getByRole("link", { name: "次へ" });
    expect(nextLink).toHaveAttribute("href", "/executions?page=2");
  });

  it("中間ページの場合、前へ・次への両方がリンクとして生成される", () => {
    render(
      <Pagination current={makeState({ page: 2 })} totalCount={50} pageSize={20} />,
    );

    const prevLink = screen.getByRole("link", { name: "前へ" });
    // page=1はpageパラメータを付与しない仕様
    expect(prevLink).toHaveAttribute("href", "/executions");

    const nextLink = screen.getByRole("link", { name: "次へ" });
    expect(nextLink).toHaveAttribute("href", "/executions?page=3");
  });

  it("最終ページの場合、「次へ」は無効化されたspanになりリンクは生成されない", () => {
    render(
      <Pagination current={makeState({ page: 3 })} totalCount={50} pageSize={20} />,
    );

    const nextSpan = screen.getByText("次へ");
    expect(nextSpan.tagName).toBe("SPAN");
    expect(nextSpan).toHaveAttribute("aria-disabled", "true");

    const prevLink = screen.getByRole("link", { name: "前へ" });
    expect(prevLink).toHaveAttribute("href", "/executions?page=2");
  });

  it("現在ページ・総ページ数・総件数を表示する", () => {
    render(
      <Pagination current={makeState({ page: 2 })} totalCount={45} pageSize={20} />,
    );

    expect(screen.getByText("2 / 3ページ（全45件）")).toBeInTheDocument();
  });

  it("フィルタ状態を保持したままhrefを生成する", () => {
    render(
      <Pagination
        current={makeState({ page: 2, status: "error", workflowId: "wf-1" })}
        totalCount={50}
        pageSize={20}
      />,
    );

    const prevLink = screen.getByRole("link", { name: "前へ" });
    expect(prevLink).toHaveAttribute(
      "href",
      "/executions?status=error&workflowId=wf-1",
    );

    const nextLink = screen.getByRole("link", { name: "次へ" });
    expect(nextLink).toHaveAttribute(
      "href",
      "/executions?status=error&workflowId=wf-1&page=3",
    );
  });

  it("current.pageが範囲外に大きい場合、最終ページへクランプされる", () => {
    render(
      <Pagination current={makeState({ page: 99 })} totalCount={50} pageSize={20} />,
    );

    expect(screen.getByText("3 / 3ページ（全50件）")).toBeInTheDocument();
    const nextSpan = screen.getByText("次へ");
    expect(nextSpan.tagName).toBe("SPAN");
  });

  it("current.pageが0以下の場合、1ページ目へクランプされる", () => {
    render(
      <Pagination current={makeState({ page: 0 })} totalCount={50} pageSize={20} />,
    );

    expect(screen.getByText("1 / 3ページ（全50件）")).toBeInTheDocument();
    const prevSpan = screen.getByText("前へ");
    expect(prevSpan.tagName).toBe("SPAN");
  });

  it("aria-labelでナビゲーション領域を識別できる", () => {
    render(
      <Pagination current={makeState({ page: 2 })} totalCount={50} pageSize={20} />,
    );

    expect(
      screen.getByRole("navigation", { name: "ページネーション" }),
    ).toBeInTheDocument();
  });
});
