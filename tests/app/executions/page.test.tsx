import { render, screen } from "@testing-library/react";
import { useRouter } from "next/navigation";
import ExecutionsPage from "../../../src/app/executions/page";
import { DbNotFoundError } from "../../../src/lib/db/connection";
import type { RawSearchParams } from "../../../src/components/executions/queryParams";

/**
 * src/app/executions/page.tsx の結合テスト。
 *
 * 特に、ページ内に閉じたprivate関数 jstDateBoundaryToUtcIso（JST日付文字列→UTC ISO8601の
 * 日境界変換、月末・年末跨ぎを含む）は queryParams.ts からエクスポートされていないため、
 * getExecutions/countExecutions への実引数（sinceIso/untilIso）を検証することで間接的に検証する。
 */

jest.mock("next/navigation", () => ({
  useRouter: jest.fn(),
}));

jest.mock("../../../src/lib/db/connection", () => {
  const actual = jest.requireActual("../../../src/lib/db/connection");
  return {
    ...actual,
    getDb: jest.fn(),
  };
});

jest.mock("../../../src/lib/db/queries", () => ({
  getExecutions: jest.fn(),
  countExecutions: jest.fn(),
  getWorkflowSummaries: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getDb } = jest.requireMock("../../../src/lib/db/connection") as {
  getDb: jest.Mock;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { getExecutions, countExecutions, getWorkflowSummaries } =
  jest.requireMock("../../../src/lib/db/queries") as {
    getExecutions: jest.Mock;
    countExecutions: jest.Mock;
    getWorkflowSummaries: jest.Mock;
  };

const mockedUseRouter = useRouter as jest.Mock;

function makeSearchParams(sp: RawSearchParams): Promise<RawSearchParams> {
  return Promise.resolve(sp);
}

async function renderPage(sp: RawSearchParams) {
  const jsx = await ExecutionsPage({ searchParams: makeSearchParams(sp) });
  return render(jsx);
}

describe("ExecutionsPage", () => {
  beforeEach(() => {
    mockedUseRouter.mockReturnValue({ push: jest.fn() });
    getDb.mockReturnValue({});
    getExecutions.mockReturnValue([]);
    countExecutions.mockReturnValue(0);
    getWorkflowSummaries.mockReturnValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("DB未作成の場合、EmptyStateで案内メッセージを表示する", async () => {
    getDb.mockImplementation(() => {
      throw new DbNotFoundError("/path/to/db.sqlite");
    });

    await renderPage({});

    expect(
      screen.getByText(/蓄積DBが見つかりません/),
    ).toBeInTheDocument();
  });

  it("フィルタ未指定の場合、sinceIso/untilIsoはundefinedのまま問い合わせる", async () => {
    await renderPage({});

    expect(getExecutions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sinceIso: undefined, untilIso: undefined }),
    );
    expect(countExecutions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sinceIso: undefined, untilIso: undefined }),
    );
  });

  it("since指定時、JST日付0時をUTCへ変換したsinceIsoを渡す（含む・下限）", async () => {
    await renderPage({ since: "2026-07-10" });

    // JST 2026-07-10T00:00:00 = UTC 2026-07-09T15:00:00.000Z
    expect(getExecutions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sinceIso: "2026-07-09T15:00:00.000Z" }),
    );
  });

  it("until指定時、JST翌日0時をUTCへ変換したuntilIsoを渡す（排他的・上限）", async () => {
    await renderPage({ until: "2026-07-10" });

    // 翌日2026-07-11のJST0時 = UTC 2026-07-10T15:00:00.000Z
    expect(getExecutions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ untilIso: "2026-07-10T15:00:00.000Z" }),
    );
  });

  it("until指定時、月末を跨ぐ場合は翌月1日のUTC境界になる", async () => {
    await renderPage({ until: "2026-06-30" });

    // 翌日2026-07-01のJST0時 = UTC 2026-06-30T15:00:00.000Z
    expect(getExecutions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ untilIso: "2026-06-30T15:00:00.000Z" }),
    );
  });

  it("until指定時、年末を跨ぐ場合は翌年1/1のUTC境界になる", async () => {
    await renderPage({ until: "2026-12-31" });

    // 翌日2027-01-01のJST0時 = UTC 2026-12-31T15:00:00.000Z
    expect(getExecutions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ untilIso: "2026-12-31T15:00:00.000Z" }),
    );
  });

  it("since指定時、年始を跨ぐ場合も正しくUTC境界へ変換する", async () => {
    await renderPage({ since: "2027-01-01" });

    // JST 2027-01-01T00:00:00 = UTC 2026-12-31T15:00:00.000Z
    expect(getExecutions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sinceIso: "2026-12-31T15:00:00.000Z" }),
    );
  });

  it("不正な日付形式のsince/untilは無視される（undefinedとして扱われる）", async () => {
    await renderPage({ since: "not-a-date", until: "2026/07/10" });

    expect(getExecutions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sinceIso: undefined, untilIso: undefined }),
    );
  });

  it("totalCount=0の場合、EmptyStateを表示しテーブル・ページネーションは表示しない", async () => {
    countExecutions.mockReturnValue(0);

    await renderPage({});

    expect(
      screen.getByText("条件に一致する実行がありません"),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("totalCount>0の場合、テーブルとページネーションを表示する", async () => {
    countExecutions.mockReturnValue(50);
    getExecutions.mockReturnValue([
      {
        id: 1,
        workflowId: "wf-1",
        status: "success",
        mode: "trigger",
        startedAt: "2026-07-01T00:00:00.000Z",
        stoppedAt: "2026-07-01T00:00:05.000Z",
        createdAt: "2026-07-01T00:00:00.000Z",
        finished: 1,
        ingestedAt: "2026-07-01T01:00:00.000Z",
      },
    ]);
    getWorkflowSummaries.mockReturnValue([
      {
        workflowId: "wf-1",
        name: "請求書生成",
        active: 1,
        successCount: 1,
        failureCount: 0,
        totalRuntimeMs: 5000,
        executionCount: 1,
        statisticsTotalCount: 1,
      },
    ]);

    await renderPage({});

    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "請求書生成" })).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "ページネーション" }),
    ).toBeInTheDocument();
  });

  it("ページ番号を指定した場合、(page-1)*PAGE_SIZEのoffsetで問い合わせる", async () => {
    countExecutions.mockReturnValue(100);

    await renderPage({ page: "3" });

    expect(getExecutions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 20, offset: 40 }),
    );
  });

  it("page未指定（既定1ページ目）の場合、offset=0で問い合わせる", async () => {
    await renderPage({});

    expect(getExecutions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 20, offset: 0 }),
    );
  });

  it("status/mode/workflowIdを指定した場合、そのままクエリフィルタへ結線される", async () => {
    await renderPage({ status: "error", mode: "manual", workflowId: "wf-1" });

    expect(getExecutions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "error",
        mode: "manual",
        workflowId: "wf-1",
      }),
    );
    expect(countExecutions).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        status: "error",
        mode: "manual",
        workflowId: "wf-1",
      }),
    );
  });
});
