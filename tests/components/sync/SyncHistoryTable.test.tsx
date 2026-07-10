import { render, screen, within } from "@testing-library/react";
import { SyncHistoryTable } from "@/components/sync/SyncHistoryTable";
import type { SyncHistoryRow } from "@/lib/db/queries/sync";

function makeRow(overrides: Partial<SyncHistoryRow>): SyncHistoryRow {
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

describe("SyncHistoryTable", () => {
  it("見出し（開始/状態/到達フェーズ/取り込み件数/生コピー削除/エラー）を表示する", () => {
    render(<SyncHistoryTable rows={[]} />);

    expect(
      screen.getByRole("columnheader", { name: "開始（JST）" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "状態" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "到達フェーズ" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "取り込み件数" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "生コピー削除" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "エラー" }),
    ).toBeInTheDocument();
  });

  it("行データが無い場合、tbodyに行が描画されない", () => {
    render(<SyncHistoryTable rows={[]} />);

    const table = screen.getByRole("table");
    const rows = within(table).getAllByRole("row");
    // ヘッダー行のみ
    expect(rows).toHaveLength(1);
  });

  it("成功履歴の1行を、開始日時(JST)・ラベル・到達フェーズとともに表示する", () => {
    const row = makeRow({
      id: 10,
      started_at: "2026-07-01T03:00:00.000Z", // JST 12:00
      status: "success",
      phase_reached: "cleanup",
    });

    render(<SyncHistoryTable rows={[row]} />);

    expect(screen.getByText("2026-07-01 12:00")).toBeInTheDocument();
    expect(screen.getByText("成功")).toBeInTheDocument();
    expect(screen.getByText("cleanup")).toBeInTheDocument();
  });

  it("rows_ingested_jsonがある場合、テーブル名: 件数の形式でカンマ区切り表示する", () => {
    const row = makeRow({
      rows_ingested_json: JSON.stringify({
        execution_entity: 1234,
        workflow_entity: 5,
      }),
    });

    render(<SyncHistoryTable rows={[row]} />);

    expect(
      screen.getByText("execution_entity: 1,234 / workflow_entity: 5"),
    ).toBeInTheDocument();
  });

  it("rows_ingested_jsonがnullの場合「—」を表示する", () => {
    // 取り込み件数セル以外を「—」にならない値にして行スコープで一意に検証する
    const row = makeRow({
      rows_ingested_json: null,
      error_message: "dummy",
    });

    render(<SyncHistoryTable rows={[row]} />);

    const dataRow = screen.getAllByRole("row")[1];
    expect(within(dataRow).getByText("—")).toBeInTheDocument();
  });

  it("rows_ingested_jsonが不正なJSONの場合「—」を表示する（例外を吸収する）", () => {
    const row = makeRow({
      rows_ingested_json: "not-json{{{",
      error_message: "dummy",
    });

    render(<SyncHistoryTable rows={[row]} />);

    const dataRow = screen.getAllByRole("row")[1];
    expect(within(dataRow).getByText("—")).toBeInTheDocument();
  });

  it("rows_ingested_jsonが空オブジェクトの場合「—」を表示する", () => {
    const row = makeRow({
      rows_ingested_json: JSON.stringify({}),
      error_message: "dummy",
    });

    render(<SyncHistoryTable rows={[row]} />);

    const dataRow = screen.getAllByRole("row")[1];
    expect(within(dataRow).getByText("—")).toBeInTheDocument();
  });

  it("raw_copy_deletedが1の場合「削除済」、0の場合「未削除」、nullの場合「—」を表示する", () => {
    const validRowsIngestedJson = JSON.stringify({ execution_entity: 1 });
    const rows = [
      makeRow({
        id: 1,
        raw_copy_deleted: 1,
        error_message: "dummy",
        rows_ingested_json: validRowsIngestedJson,
      }),
      makeRow({
        id: 2,
        raw_copy_deleted: 0,
        error_message: "dummy",
        rows_ingested_json: validRowsIngestedJson,
      }),
      makeRow({
        id: 3,
        raw_copy_deleted: null,
        error_message: "dummy",
        rows_ingested_json: validRowsIngestedJson,
      }),
    ];

    render(<SyncHistoryTable rows={rows} />);

    const dataRows = screen.getAllByRole("row").slice(1);
    expect(within(dataRows[0]).getByText("削除済")).toBeInTheDocument();
    expect(within(dataRows[1]).getByText("未削除")).toBeInTheDocument();
    expect(within(dataRows[2]).getByText("—")).toBeInTheDocument();
  });

  it("エラー行（status=failed, error_message設定済み）のエラーメッセージを表示する", () => {
    const row = makeRow({
      status: "failed",
      phase_reached: "extract",
      error_message: "接続がタイムアウトしました",
    });

    render(<SyncHistoryTable rows={[row]} />);

    expect(screen.getByText("失敗")).toBeInTheDocument();
    expect(
      screen.getByText("接続がタイムアウトしました"),
    ).toBeInTheDocument();
  });

  it("error_messageがnullの場合、エラー列に「—」を表示する", () => {
    const row = makeRow({
      status: "success",
      error_message: null,
      rows_ingested_json: JSON.stringify({ execution_entity: 1 }),
    });

    render(<SyncHistoryTable rows={[row]} />);

    const dataRow = screen.getAllByRole("row")[1];
    expect(within(dataRow).getByText("—")).toBeInTheDocument();
  });

  it("phase_reachedがnullの場合「—」を表示する", () => {
    const row = makeRow({
      phase_reached: null,
      error_message: "dummy",
      rows_ingested_json: JSON.stringify({ execution_entity: 1 }),
    });

    render(<SyncHistoryTable rows={[row]} />);

    const dataRow = screen.getAllByRole("row")[1];
    expect(within(dataRow).getByText("—")).toBeInTheDocument();
  });

  it("複数行を渡された順序どおりにレンダリングする", () => {
    const rows = [
      makeRow({ id: 1, phase_reached: "phase-a" }),
      makeRow({ id: 2, phase_reached: "phase-b" }),
    ];

    render(<SyncHistoryTable rows={rows} />);

    const table = screen.getByRole("table");
    const bodyRows = within(table).getAllByRole("row").slice(1);
    expect(bodyRows).toHaveLength(2);
    expect(within(bodyRows[0]).getByText("phase-a")).toBeInTheDocument();
    expect(within(bodyRows[1]).getByText("phase-b")).toBeInTheDocument();
  });
});
