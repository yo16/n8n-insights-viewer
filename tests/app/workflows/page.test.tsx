import { render, screen, within } from "@testing-library/react";
import type { WorkflowSummaryRow } from "../../../src/lib/db/queries/workflows";
import { getWorkflowSummaries } from "../../../src/lib/db/queries/workflows";
import { DbNotFoundError, getDb } from "../../../src/lib/db/connection";

/**
 * `src/app/workflows/page.tsx`（画面3: ワークフロー別一覧）の結合テスト。
 *
 * Server Component（async関数）を直接呼び出し、その戻り値（JSX）をレンダリングする。
 * `getDb`/`getWorkflowSummaries` はモックし、DB未作成・0件フィルタ・
 * 不正なsearchParams・正常系の子コンポーネントへの受け渡しを検証する。
 *
 * `server-only` は `next/jest` が自動的に空モジュールへ差し替えるため、
 * このテストファイルで個別にモックする必要はない。
 *
 * `jest.mock()` の対象パスは相対パスで指定する（`@/*` エイリアスはNext.jsの
 * SWCトランスフォームでimport文自体を書き換える仕組みのため、`jest.mock()`の
 * 文字列引数としては解決できない。実装側（page.tsx）は引き続き `@/...` で
 * importしてよく、モックは解決後の実ファイルパスで一致する）。
 */
jest.mock("../../../src/lib/db/connection", () => {
  const actual = jest.requireActual("../../../src/lib/db/connection");
  return {
    ...actual,
    getDb: jest.fn(),
  };
});

jest.mock("../../../src/lib/db/queries/workflows", () => ({
  getWorkflowSummaries: jest.fn(),
}));

jest.mock("next/navigation", () => ({
  usePathname: jest.fn(() => "/workflows"),
  useRouter: jest.fn(() => ({ push: jest.fn() })),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}));

const mockedGetDb = getDb as jest.Mock;
const mockedGetWorkflowSummaries = getWorkflowSummaries as jest.Mock;

function makeRawRow(overrides: Partial<WorkflowSummaryRow> = {}): WorkflowSummaryRow {
  return {
    workflowId: "wf-1",
    name: "workflow-1",
    active: 1,
    successCount: 0,
    failureCount: 0,
    totalRuntimeMs: 0,
    executionCount: 0,
    statisticsTotalCount: 0,
    ...overrides,
  };
}

type RawSearchParams = Record<string, string | string[] | undefined>;

async function renderPage(searchParams: RawSearchParams) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  const { default: WorkflowsPage } = require("../../../src/app/workflows/page");
  const ui = await WorkflowsPage({ searchParams: Promise.resolve(searchParams) });
  return render(ui);
}

describe("WorkflowsPage", () => {
  beforeEach(() => {
    mockedGetDb.mockReset();
    mockedGetWorkflowSummaries.mockReset();
    mockedGetDb.mockReturnValue({});
  });

  describe("searchParamsのバリデーション", () => {
    it("不正なsort/order値の場合、デフォルト（name昇順）にフォールバックする", async () => {
      mockedGetWorkflowSummaries.mockReturnValue([
        makeRawRow({ workflowId: "wf-1", name: "a" }),
      ]);

      await renderPage({ sort: "not-a-real-key", order: "not-a-real-order" });

      const nameHeader = screen.getByRole("columnheader", { name: /ワークフロー名/ });
      expect(nameHeader).toHaveAttribute("aria-sort", "ascending");

      const executionHeader = screen.getByRole("columnheader", { name: /実行数/ });
      expect(executionHeader).toHaveAttribute("aria-sort", "none");
    });

    it("sort/orderが未指定の場合もデフォルト（name昇順）になる", async () => {
      mockedGetWorkflowSummaries.mockReturnValue([
        makeRawRow({ workflowId: "wf-1", name: "a" }),
      ]);

      await renderPage({});

      const nameHeader = screen.getByRole("columnheader", { name: /ワークフロー名/ });
      expect(nameHeader).toHaveAttribute("aria-sort", "ascending");
    });
  });

  describe("DB未作成", () => {
    it("DbNotFoundErrorの場合、EmptyStateと同期画面へのリンクを表示する", async () => {
      mockedGetDb.mockImplementation(() => {
        throw new DbNotFoundError("dummy-path");
      });

      await renderPage({});

      expect(
        screen.getByText(/まだ同期されていません。npm run sync を実行するか/),
      ).toBeInTheDocument();
      const link = screen.getByRole("link", { name: "同期画面へ" });
      expect(link).toHaveAttribute("href", "/sync");
      // フィルタ用Toolbarやテーブルは表示されない
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    });

    it("DbNotFoundError以外のエラーは再スローされる", async () => {
      mockedGetDb.mockImplementation(() => {
        throw new Error("unexpected error");
      });

      await expect(renderPage({})).rejects.toThrow("unexpected error");
    });
  });

  describe("フィルタ後0件", () => {
    it("0件の場合「条件に一致するデータがありません」を表示し、Toolbarは表示されたままにする", async () => {
      mockedGetWorkflowSummaries.mockReturnValue([]);

      await renderPage({ active: "1" });

      expect(screen.getByText("条件に一致するデータがありません。")).toBeInTheDocument();
      expect(
        screen.getByRole("checkbox", { name: "アクティブのみ表示" }),
      ).toBeInTheDocument();
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
    });
  });

  describe("子コンポーネントへの受け渡し（結合確認）", () => {
    it("activeOnly=trueの場合、getWorkflowSummariesにactiveOnly:trueを渡し、Toolbarがチェック済みで表示される", async () => {
      mockedGetWorkflowSummaries.mockReturnValue([makeRawRow()]);

      await renderPage({ active: "1" });

      expect(mockedGetWorkflowSummaries).toHaveBeenCalledWith(
        expect.anything(),
        { activeOnly: true },
      );
      expect(
        screen.getByRole("checkbox", { name: "アクティブのみ表示" }),
      ).toBeChecked();
    });

    it("active未指定の場合、getWorkflowSummariesにactiveOnly:falseを渡す", async () => {
      mockedGetWorkflowSummaries.mockReturnValue([makeRawRow()]);

      await renderPage({});

      expect(mockedGetWorkflowSummaries).toHaveBeenCalledWith(
        expect.anything(),
        { activeOnly: false },
      );
      expect(
        screen.getByRole("checkbox", { name: "アクティブのみ表示" }),
      ).not.toBeChecked();
    });

    it("sort/orderが子テーブルへ伝わり、指定キー・順序で行がソートされて表示される", async () => {
      mockedGetWorkflowSummaries.mockReturnValue([
        makeRawRow({ workflowId: "wf-a", name: "a", executionCount: 5, successCount: 5 }),
        makeRawRow({ workflowId: "wf-b", name: "b", executionCount: 20, successCount: 20 }),
      ]);

      await renderPage({ sort: "executionCount", order: "desc" });

      const executionHeader = screen.getByRole("columnheader", { name: /実行数/ });
      expect(executionHeader).toHaveAttribute("aria-sort", "descending");

      const table = screen.getByRole("table");
      const rows = within(table).getAllByRole("row").slice(1); // ヘッダ行を除く
      expect(within(rows[0]).getByText("b")).toBeInTheDocument();
      expect(within(rows[1]).getByText("a")).toBeInTheDocument();
    });
  });
});
