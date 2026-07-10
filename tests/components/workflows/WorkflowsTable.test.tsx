import { render, screen } from "@testing-library/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { WorkflowsTable } from "@/components/workflows/WorkflowsTable";
import type { WorkflowSummaryRowWithDerived } from "@/components/workflows/types";

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(),
  useRouter: jest.fn(),
  useSearchParams: jest.fn(),
}));

const mockedUsePathname = usePathname as jest.Mock;
const mockedUseRouter = useRouter as jest.Mock;
const mockedUseSearchParams = useSearchParams as jest.Mock;

function makeRow(
  overrides: Partial<WorkflowSummaryRowWithDerived> = {},
): WorkflowSummaryRowWithDerived {
  return {
    workflowId: "wf-1",
    name: "workflow-1",
    active: 1,
    successCount: 0,
    failureCount: 0,
    totalRuntimeMs: 0,
    executionCount: 0,
    statisticsTotalCount: 0,
    successRate: null,
    avgRuntimeMs: null,
    ...overrides,
  };
}

describe("WorkflowsTable", () => {
  const push = jest.fn();

  beforeEach(() => {
    push.mockClear();
    mockedUsePathname.mockReturnValue("/workflows");
    mockedUseRouter.mockReturnValue({ push });
    mockedUseSearchParams.mockReturnValue(new URLSearchParams());
  });

  describe("行の値表示", () => {
    it("成功率が算出できる場合、パーセント表示する", () => {
      render(
        <WorkflowsTable
          rows={[
            makeRow({
              executionCount: 10,
              successCount: 10,
              successRate: 100,
              avgRuntimeMs: 500,
              totalRuntimeMs: 5000,
            }),
          ]}
          sortKey="name"
          order="asc"
        />,
      );

      expect(screen.getByText("100.0%")).toBeInTheDocument();
    });

    it("実行数0件（successRate/avgRuntimeMsがnull）の場合、\"-\"を表示する", () => {
      render(
        <WorkflowsTable
          rows={[
            makeRow({
              executionCount: 0,
              successRate: null,
              avgRuntimeMs: null,
              totalRuntimeMs: 0,
            }),
          ]}
          sortKey="name"
          order="asc"
        />,
      );

      const cells = screen.getAllByText("-");
      expect(cells).toHaveLength(2);
    });

    it("ワークフロー名・アクティブ状態・実行数・生涯累計を表示する", () => {
      render(
        <WorkflowsTable
          rows={[
            makeRow({
              name: "my-workflow",
              active: 1,
              executionCount: 42,
              statisticsTotalCount: 999,
            }),
          ]}
          sortKey="name"
          order="asc"
        />,
      );

      expect(screen.getByText("my-workflow")).toBeInTheDocument();
      expect(screen.getByText("アクティブ")).toBeInTheDocument();
      expect(screen.getByText("42")).toBeInTheDocument();
      expect(screen.getByText("999")).toBeInTheDocument();
    });

    it("非アクティブなワークフローは「非アクティブ」と表示する", () => {
      render(
        <WorkflowsTable rows={[makeRow({ active: 0 })]} sortKey="name" order="asc" />,
      );

      expect(screen.getByText("非アクティブ")).toBeInTheDocument();
    });

    it("合計実行時間（totalRuntimeMs）はフォーマット済みの値（分単位）で表示する", () => {
      render(
        <WorkflowsTable
          rows={[makeRow({ totalRuntimeMs: 125_000 })]}
          sortKey="name"
          order="asc"
        />,
      );

      // formatDurationMs: 60_000ms以上は分単位（小数第1位）で表示される
      expect(screen.getByText("2.1分")).toBeInTheDocument();
    });

    it("合計実行時間が秒未満の場合、msのまま表示する", () => {
      render(
        <WorkflowsTable
          rows={[makeRow({ totalRuntimeMs: 500 })]}
          sortKey="name"
          order="asc"
        />,
      );

      expect(screen.getByText("500ms")).toBeInTheDocument();
    });
  });

  describe("aria-sort", () => {
    it("現在のソートキーの列は昇順のときascendingになる", () => {
      render(<WorkflowsTable rows={[]} sortKey="executionCount" order="asc" />);

      const header = screen.getByRole("columnheader", { name: /実行数/ });
      expect(header).toHaveAttribute("aria-sort", "ascending");
    });

    it("現在のソートキーの列は降順のときdescendingになる", () => {
      render(<WorkflowsTable rows={[]} sortKey="executionCount" order="desc" />);

      const header = screen.getByRole("columnheader", { name: /実行数/ });
      expect(header).toHaveAttribute("aria-sort", "descending");
    });

    it("ソート対象外の列はnoneになる", () => {
      render(<WorkflowsTable rows={[]} sortKey="executionCount" order="asc" />);

      const header = screen.getByRole("columnheader", { name: /ワークフロー名/ });
      expect(header).toHaveAttribute("aria-sort", "none");
    });
  });

  describe("低成功率行の強調", () => {
    it("成功率80%未満（danger）の場合、sr-onlyテキスト「危険」を含む", () => {
      render(
        <WorkflowsTable
          rows={[makeRow({ executionCount: 10, successRate: 50 })]}
          sortKey="name"
          order="asc"
        />,
      );

      expect(screen.getByText("（危険）")).toBeInTheDocument();
    });

    it("成功率80%以上95%未満（warning）の場合、sr-onlyテキスト「注意」を含む", () => {
      render(
        <WorkflowsTable
          rows={[makeRow({ executionCount: 10, successRate: 85 })]}
          sortKey="name"
          order="asc"
        />,
      );

      expect(screen.getByText("（注意）")).toBeInTheDocument();
    });

    it("成功率95%以上（normal）の場合、sr-onlyテキストを含まない", () => {
      render(
        <WorkflowsTable
          rows={[makeRow({ executionCount: 10, successRate: 99 })]}
          sortKey="name"
          order="asc"
        />,
      );

      expect(screen.queryByText("（危険）")).not.toBeInTheDocument();
      expect(screen.queryByText("（注意）")).not.toBeInTheDocument();
    });

    it("実行数0件（successRate=null）の場合、警告アイコンは表示されない", () => {
      render(
        <WorkflowsTable
          rows={[makeRow({ executionCount: 0, successRate: null })]}
          sortKey="name"
          order="asc"
        />,
      );

      expect(screen.queryByText("（危険）")).not.toBeInTheDocument();
      expect(screen.queryByText("（注意）")).not.toBeInTheDocument();
    });

    describe("閾値の境界値（オフバイワン検出）", () => {
      it("成功率がちょうど80の場合、danger（<80）ではなくwarning（注意）扱いになる", () => {
        render(
          <WorkflowsTable
            rows={[makeRow({ executionCount: 10, successRate: 80 })]}
            sortKey="name"
            order="asc"
          />,
        );

        expect(screen.getByText("（注意）")).toBeInTheDocument();
        expect(screen.queryByText("（危険）")).not.toBeInTheDocument();
      });

      it("成功率がちょうど95の場合、warning（<95）ではなくnormal扱いになりsr-onlyテキストを含まない", () => {
        render(
          <WorkflowsTable
            rows={[makeRow({ executionCount: 10, successRate: 95 })]}
            sortKey="name"
            order="asc"
          />,
        );

        expect(screen.queryByText("（注意）")).not.toBeInTheDocument();
        expect(screen.queryByText("（危険）")).not.toBeInTheDocument();
        expect(screen.getByText("95.0%")).toBeInTheDocument();
      });
    });
  });

  describe("ヘッダクリックによるソート更新", () => {
    it("未ソートの列をクリックすると、そのキーで昇順のURLに遷移する", () => {
      render(<WorkflowsTable rows={[]} sortKey="name" order="asc" />);

      const header = screen.getByRole("button", { name: /実行数/ });
      header.click();

      expect(push).toHaveBeenCalledWith("/workflows?sort=executionCount&order=asc");
    });

    it("現在昇順でソート中の列を再クリックすると降順に切り替わる", () => {
      render(<WorkflowsTable rows={[]} sortKey="name" order="asc" />);

      const header = screen.getByRole("button", { name: /ワークフロー名/ });
      header.click();

      expect(push).toHaveBeenCalledWith("/workflows?sort=name&order=desc");
    });

    it("現在降順でソート中の列を再クリックすると昇順に戻る", () => {
      render(<WorkflowsTable rows={[]} sortKey="name" order="desc" />);

      const header = screen.getByRole("button", { name: /ワークフロー名/ });
      header.click();

      expect(push).toHaveBeenCalledWith("/workflows?sort=name&order=asc");
    });
  });
});
