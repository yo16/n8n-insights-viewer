import { render, screen, fireEvent } from "@testing-library/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { InsightsFilterBar } from "@/components/insights/InsightsFilterBar";
import type { InsightsFilterBarWorkflowOption } from "@/components/insights/InsightsFilterBar";

/**
 * src/components/insights/InsightsFilterBar.tsx の単体テスト。
 *
 * `docs/design/frontend-design.md` 画面2「フィルタ（URL searchParams・サーバー再クエリ）」:
 * 選択値を直接JSでフィルタせず、router.pushでURL searchParamsを更新することを検証する。
 */
jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

const mockedUsePathname = usePathname as jest.Mock;
const mockedUseRouter = useRouter as jest.Mock;
const mockedUseSearchParams = useSearchParams as jest.Mock;

const workflows: InsightsFilterBarWorkflowOption[] = [
  { id: "wf-1", name: "ワークフローA" },
  { id: "wf-2", name: "ワークフローB" },
];

function setupRouterMocks(initialSearch = "") {
  const push = jest.fn();
  mockedUsePathname.mockReturnValue("/insights");
  mockedUseRouter.mockReturnValue({ push });
  mockedUseSearchParams.mockReturnValue(new URLSearchParams(initialSearch));
  return { push };
}

describe("InsightsFilterBar", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("期間・ワークフローのセレクトを表示し、現在の選択値が反映される", () => {
    setupRouterMocks();
    render(<InsightsFilterBar range="30d" workflowId="wf-2" workflows={workflows} />);

    expect(screen.getByLabelText("期間")).toHaveValue("30d");
    expect(screen.getByLabelText("ワークフロー")).toHaveValue("wf-2");
  });

  it("workflowId省略時はワークフローセレクトが「すべて」（空文字）になる", () => {
    setupRouterMocks();
    render(<InsightsFilterBar range="7d" workflows={workflows} />);

    expect(screen.getByLabelText("ワークフロー")).toHaveValue("");
  });

  it("ワークフロー一覧のオプションがすべて表示される", () => {
    setupRouterMocks();
    render(<InsightsFilterBar range="7d" workflows={workflows} />);

    expect(screen.getByRole("option", { name: "すべて" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "ワークフローA" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "ワークフローB" })).toBeInTheDocument();
  });

  it("期間セレクトを変更すると、rangeパラメータを更新したURLでrouter.pushする", () => {
    const { push } = setupRouterMocks("workflowId=wf-1");
    render(<InsightsFilterBar range="30d" workflowId="wf-1" workflows={workflows} />);

    fireEvent.change(screen.getByLabelText("期間"), { target: { value: "90d" } });

    expect(push).toHaveBeenCalledTimes(1);
    const pushedUrl = push.mock.calls[0][0] as string;
    expect(pushedUrl.startsWith("/insights?")).toBe(true);
    const params = new URLSearchParams(pushedUrl.split("?")[1]);
    expect(params.get("range")).toBe("90d");
    expect(params.get("workflowId")).toBe("wf-1");
  });

  it("ワークフローセレクトで特定のワークフローを選ぶと、workflowIdパラメータを設定してpushする", () => {
    const { push } = setupRouterMocks("range=7d");
    render(<InsightsFilterBar range="7d" workflows={workflows} />);

    fireEvent.change(screen.getByLabelText("ワークフロー"), { target: { value: "wf-2" } });

    const pushedUrl = push.mock.calls[0][0] as string;
    const params = new URLSearchParams(pushedUrl.split("?")[1]);
    expect(params.get("workflowId")).toBe("wf-2");
    expect(params.get("range")).toBe("7d");
  });

  it("ワークフローセレクトで「すべて」を選ぶと、workflowIdパラメータを削除してpushする", () => {
    const { push } = setupRouterMocks("range=7d&workflowId=wf-1");
    render(<InsightsFilterBar range="7d" workflowId="wf-1" workflows={workflows} />);

    fireEvent.change(screen.getByLabelText("ワークフロー"), { target: { value: "" } });

    const pushedUrl = push.mock.calls[0][0] as string;
    expect(pushedUrl).toBe("/insights?range=7d");
  });

  it("クエリが空になる場合は '?' 無しのpathnameのみでpushする", () => {
    const { push } = setupRouterMocks("range=30d");
    render(<InsightsFilterBar range="30d" workflows={workflows} />);

    fireEvent.change(screen.getByLabelText("期間"), { target: { value: "" as never } });

    // range="" は本来UIから発生しないが、updateParamの分岐（value無しでdelete）を検証する
    expect(push).toHaveBeenCalledWith("/insights");
  });
});
