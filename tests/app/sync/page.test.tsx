import { render, screen, within } from "@testing-library/react";
import { DbNotFoundError } from "@/lib/db/connection";
import type { SyncHistoryRow } from "@/lib/db/queries/sync";
import Page from "@/app/sync/page";

/**
 * src/app/sync/page.tsx（画面6: 同期ステータス, Server Component）の単体テスト。
 *
 * `@/lib/db/connection` / `@/lib/db/queries/sync` / `@/app/sync/_lib/coverage` /
 * `@/app/sync/_lib/staleness` をモックし、page.tsx自体の分岐ロジック
 * （DB未作成時のEmptyState表示、履歴フォールバック文言、未同期警告バナーの2文言分岐、
 * カバー範囲nullの表示、100件走査→20件表示のスライス）を検証する。
 *
 * page.tsxは `src/app/**` 配下でありnext/jestのSWC変換により import specifier が
 * 書き換えられるため（`tests/app/api/sync/route.test.ts` 等の既存テストと同様）、
 * jest.mock は実体の相対パスで指定する。
 */

const getDbMock = jest.fn();
const getLatestSyncHistoryMock = jest.fn();
const getSyncHistoryListMock = jest.fn();
const getCoverageRangeMock = jest.fn();
const evaluateStalenessMock = jest.fn();

jest.mock("../../../src/lib/db/connection", () => {
  const actual = jest.requireActual("../../../src/lib/db/connection");
  return {
    ...actual,
    getDb: (...args: unknown[]) => getDbMock(...args),
  };
});

jest.mock("../../../src/lib/db/queries/sync", () => ({
  getLatestSyncHistory: (...args: unknown[]) => getLatestSyncHistoryMock(...args),
  getSyncHistoryList: (...args: unknown[]) => getSyncHistoryListMock(...args),
}));

jest.mock("../../../src/app/sync/_lib/coverage", () => ({
  getCoverageRange: (...args: unknown[]) => getCoverageRangeMock(...args),
}));

jest.mock("../../../src/app/sync/_lib/staleness", () => {
  const actual = jest.requireActual("../../../src/app/sync/_lib/staleness");
  return {
    ...actual,
    evaluateStaleness: (...args: unknown[]) => evaluateStalenessMock(...args),
  };
});

jest.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: jest.fn() }),
}));

function makeRow(overrides: Partial<SyncHistoryRow> = {}): SyncHistoryRow {
  return {
    id: 1,
    started_at: "2026-07-01T00:00:00.000Z",
    finished_at: "2026-07-01T00:10:00.000Z",
    status: "success",
    phase_reached: "cleanup",
    integrity_ok: 1,
    schema_ok: 1,
    rows_ingested_json: null,
    collector_version_seen: null,
    error_message: null,
    raw_copy_deleted: 1,
    ...overrides,
  };
}

const NULL_COVERAGE = {
  insights: { min: null, max: null },
  executions: { min: null, max: null },
};

const NOT_STALE = { lastSuccess: undefined, daysSinceLastSuccess: null, isStale: false };

describe("SyncStatusPage", () => {
  beforeEach(() => {
    getDbMock.mockReset();
    getLatestSyncHistoryMock.mockReset();
    getSyncHistoryListMock.mockReset();
    getCoverageRangeMock.mockReset();
    evaluateStalenessMock.mockReset();

    getDbMock.mockReturnValue({});
    getLatestSyncHistoryMock.mockReturnValue(undefined);
    getSyncHistoryListMock.mockReturnValue([]);
    getCoverageRangeMock.mockReturnValue(NULL_COVERAGE);
    evaluateStalenessMock.mockReturnValue(NOT_STALE);
  });

  it("DB未作成（DbNotFoundError）の場合、EmptyStateと同期実行ボタンを表示し、他のCardは表示しない", () => {
    getDbMock.mockImplementation(() => {
      throw new DbNotFoundError("/fake/path/n8n_insights.sqlite");
    });

    render(<Page />);

    expect(
      screen.getByRole("heading", { level: 1, name: "同期ステータス" }),
    ).toBeInTheDocument();

    const emptyState = screen.getAllByRole("status")[0];
    expect(emptyState).toHaveTextContent("まだ同期されていません");
    expect(
      within(emptyState).getByRole("button", { name: "同期を実行" }),
    ).toBeInTheDocument();

    expect(screen.queryByText("データのカバー範囲")).not.toBeInTheDocument();
    expect(screen.queryByText("同期履歴")).not.toBeInTheDocument();
  });

  it("DbNotFoundError以外のエラーはそのまま再スローする", () => {
    getDbMock.mockImplementation(() => {
      throw new Error("想定外のDBエラー");
    });

    expect(() => render(<Page />)).toThrow("想定外のDBエラー");
  });

  it("履歴が無い場合、最終同期・同期履歴それぞれにフォールバック文言を表示する", () => {
    getLatestSyncHistoryMock.mockReturnValue(undefined);
    getSyncHistoryListMock.mockReturnValue([]);

    render(<Page />);

    expect(
      screen.getByText("同期の実行履歴がありません。まだ一度も同期が実行されていません。"),
    ).toBeInTheDocument();
    expect(screen.getByText("同期の実行履歴がありません。")).toBeInTheDocument();
  });

  it("未同期警告バナー: 最終成功同期からの経過日数がある場合の文言を表示する", () => {
    evaluateStalenessMock.mockReturnValue({
      lastSuccess: makeRow({ finished_at: "2026-07-01T00:00:00.000Z" }),
      daysSinceLastSuccess: 9.7,
      isStale: true,
    });

    render(<Page />);

    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent("未同期警告");
    expect(banner).toHaveTextContent("最終成功同期");
    expect(banner).toHaveTextContent("約9日");
    expect(banner).toHaveTextContent("6日を超えると");
  });

  it("未同期警告バナー: 一度も成功していない場合の文言を表示する", () => {
    evaluateStalenessMock.mockReturnValue({
      lastSuccess: undefined,
      daysSinceLastSuccess: null,
      isStale: true,
    });

    render(<Page />);

    const banner = screen.getByRole("alert");
    expect(banner).toHaveTextContent("未同期警告");
    expect(banner).toHaveTextContent("同期に一度も成功していません");
  });

  it("isStale=falseの場合、未同期警告バナーは表示されない", () => {
    evaluateStalenessMock.mockReturnValue(NOT_STALE);

    render(<Page />);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("カバー範囲がnullの場合、開始/終了ともに「—」を表示する", () => {
    getCoverageRangeMock.mockReturnValue(NULL_COVERAGE);
    getSyncHistoryListMock.mockReturnValue([]);

    render(<Page />);

    // insights(min/max) + executions(min/max) の4セルすべてが「—」
    expect(screen.getAllByText("—")).toHaveLength(4);
  });

  it("同期履歴は最大100件走査するが、画面表示は先頭20件のみに絞る", () => {
    const rows: SyncHistoryRow[] = Array.from({ length: 25 }, (_, i) =>
      makeRow({ id: i, phase_reached: `phase-${i}` }),
    );
    getSyncHistoryListMock.mockReturnValue(rows);
    getLatestSyncHistoryMock.mockReturnValue(rows[0]);

    render(<Page />);

    expect(getSyncHistoryListMock).toHaveBeenCalledWith(expect.anything(), 100);

    const table = screen
      .getByRole("columnheader", { name: "取り込み件数" })
      .closest("table");
    expect(table).not.toBeNull();
    const rowsRendered = within(table as HTMLTableElement).getAllByRole("row");
    // ヘッダー行1 + データ20件
    expect(rowsRendered).toHaveLength(21);

    expect(screen.getByText("phase-19")).toBeInTheDocument();
    expect(screen.queryByText("phase-20")).not.toBeInTheDocument();
  });
});
