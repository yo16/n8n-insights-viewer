import { render, screen, fireEvent } from "@testing-library/react";
import { useRouter } from "next/navigation";
import { ExecutionFilters } from "../../../src/components/executions/ExecutionFilters";
import type { ExecutionsFilterState } from "../../../src/components/executions/queryParams";

/**
 * src/components/executions/ExecutionFilters.tsx の単体テスト。
 * フィルタ変更でpage=1リセットのURL生成（画面4: フィルタUI）。useRouterをモックする。
 */
jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

const mockedUseRouter = useRouter as jest.Mock;

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

describe("ExecutionFilters", () => {
  let push: jest.Mock;

  beforeEach(() => {
    push = jest.fn();
    mockedUseRouter.mockReturnValue({ push });
  });

  it("アクセシブルなフォームラベルが設定されている", () => {
    render(<ExecutionFilters current={makeState()} workflowOptions={[]} />);

    expect(
      screen.getByRole("form", { name: "実行明細の絞り込み" }),
    ).toBeInTheDocument();
  });

  it("ワークフロー選択肢を表示する", () => {
    render(
      <ExecutionFilters
        current={makeState()}
        workflowOptions={[
          { id: "wf-1", name: "請求書生成" },
          { id: "wf-2", name: "在庫同期" },
        ]}
      />,
    );

    expect(
      screen.getByRole("option", { name: "請求書生成" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "在庫同期" })).toBeInTheDocument();
  });

  it("statusを変更すると、page=1にリセットされたURLへ遷移する", () => {
    render(
      <ExecutionFilters
        current={makeState({ page: 5 })}
        workflowOptions={[]}
      />,
    );

    fireEvent.change(screen.getByLabelText("状態"), {
      target: { value: "error" },
    });

    expect(push).toHaveBeenCalledWith("/executions?status=error");
  });

  it("modeを変更すると、既存の他フィルタを保持しつつpage=1でURLを組み立てる", () => {
    render(
      <ExecutionFilters
        current={makeState({ status: "success", page: 3 })}
        workflowOptions={[]}
      />,
    );

    fireEvent.change(screen.getByLabelText("モード"), {
      target: { value: "manual" },
    });

    expect(push).toHaveBeenCalledWith(
      "/executions?status=success&mode=manual",
    );
  });

  it("ワークフローを変更すると、対応するURLへ遷移する", () => {
    render(
      <ExecutionFilters
        current={makeState()}
        workflowOptions={[{ id: "wf-1", name: "請求書生成" }]}
      />,
    );

    fireEvent.change(screen.getByLabelText("ワークフロー"), {
      target: { value: "wf-1" },
    });

    expect(push).toHaveBeenCalledWith("/executions?workflowId=wf-1");
  });

  it("開始日（since）を変更すると、対応するURLへ遷移する", () => {
    render(<ExecutionFilters current={makeState()} workflowOptions={[]} />);

    fireEvent.change(screen.getByLabelText("開始日（以降・JST）"), {
      target: { value: "2026-07-01" },
    });

    expect(push).toHaveBeenCalledWith("/executions?since=2026-07-01");
  });

  it("終了日（until）を変更すると、対応するURLへ遷移する", () => {
    render(<ExecutionFilters current={makeState()} workflowOptions={[]} />);

    fireEvent.change(screen.getByLabelText("開始日（以前・JST）"), {
      target: { value: "2026-07-31" },
    });

    expect(push).toHaveBeenCalledWith("/executions?until=2026-07-31");
  });

  it("選択肢を「すべて」に戻すと、当該フィルタが外れたURLへ遷移する", () => {
    render(
      <ExecutionFilters
        current={makeState({ status: "error", page: 2 })}
        workflowOptions={[]}
      />,
    );

    fireEvent.change(screen.getByLabelText("状態"), {
      target: { value: "" },
    });

    expect(push).toHaveBeenCalledWith("/executions");
  });

  it("フィルタが1つも設定されていない場合、フィルタ解除ボタンは表示されない", () => {
    render(<ExecutionFilters current={makeState()} workflowOptions={[]} />);

    expect(
      screen.queryByRole("button", { name: "フィルタ解除" }),
    ).not.toBeInTheDocument();
  });

  it("フィルタが設定されている場合、フィルタ解除ボタンが表示され、押下で/executionsへ遷移する", () => {
    render(
      <ExecutionFilters
        current={makeState({ status: "error" })}
        workflowOptions={[]}
      />,
    );

    const resetButton = screen.getByRole("button", { name: "フィルタ解除" });
    expect(resetButton).toBeInTheDocument();

    fireEvent.click(resetButton);
    expect(push).toHaveBeenCalledWith("/executions");
  });
});
