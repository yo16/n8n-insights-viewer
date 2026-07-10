import { render, screen } from "@testing-library/react";
import type { ExecutionEntityRow } from "../../../src/shared/types";
import { ExecutionsTable } from "../../../src/components/executions/ExecutionsTable";
import styles from "../../../src/components/executions/ExecutionsTable.module.css";

/**
 * src/components/executions/ExecutionsTable.tsx の単体テスト。
 * 行表示・error/crashed行の強調・null値の扱い（画面4: 実行明細一覧）
 */
function makeRow(overrides: Partial<ExecutionEntityRow> = {}): ExecutionEntityRow {
  return {
    id: 1,
    workflowId: "wf-1",
    status: "success",
    mode: "trigger",
    startedAt: "2026-07-01T00:00:00.000Z",
    stoppedAt: "2026-07-01T00:00:05.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
    finished: 1,
    ingestedAt: "2026-07-01T01:00:00.000Z",
    ...overrides,
  };
}

describe("ExecutionsTable", () => {
  it("列見出しを表示する", () => {
    render(<ExecutionsTable rows={[]} workflowNames={new Map()} />);

    for (const header of [
      "実行ID",
      "ワークフロー名",
      "状態",
      "モード",
      "開始（JST）",
      "終了（JST）",
      "所要時間",
    ]) {
      expect(
        screen.getByRole("columnheader", { name: header }),
      ).toBeInTheDocument();
    }
  });

  it("行が無い場合はtbodyが空になる", () => {
    const { container } = render(
      <ExecutionsTable rows={[]} workflowNames={new Map()} />,
    );

    expect(container.querySelectorAll("tbody tr")).toHaveLength(0);
  });

  it("workflowNamesに解決名がある場合はその名前を表示する", () => {
    const rows = [makeRow({ workflowId: "wf-1" })];
    const workflowNames = new Map([["wf-1", "請求書生成"]]);

    render(<ExecutionsTable rows={rows} workflowNames={workflowNames} />);

    expect(screen.getByText("請求書生成")).toBeInTheDocument();
  });

  it("workflowNamesに解決名が無い場合はworkflowIdをそのまま表示する", () => {
    const rows = [makeRow({ workflowId: "wf-unknown" })];

    render(<ExecutionsTable rows={rows} workflowNames={new Map()} />);

    expect(screen.getByText("wf-unknown")).toBeInTheDocument();
  });

  it("workflowIdがnullの場合は「—」を表示する", () => {
    const rows = [makeRow({ workflowId: null })];

    render(<ExecutionsTable rows={rows} workflowNames={new Map()} />);

    const cells = screen.getAllByRole("cell");
    expect(cells[1]).toHaveTextContent("—"); // ワークフロー名列（2列目 = index 1）
  });

  it("modeがnullの場合は「—」を表示する", () => {
    const rows = [makeRow({ mode: null })];

    render(<ExecutionsTable rows={rows} workflowNames={new Map()} />);

    const cells = screen.getAllByRole("cell");
    // モード列（4列目 = index 3）
    expect(cells[3]).toHaveTextContent("—");
  });

  it("startedAt/stoppedAtがnullの場合、日時・所要時間ともに「—」を表示する", () => {
    const rows = [makeRow({ startedAt: null, stoppedAt: null })];

    render(<ExecutionsTable rows={rows} workflowNames={new Map()} />);

    const cells = screen.getAllByRole("cell");
    expect(cells[4]).toHaveTextContent("—"); // 開始
    expect(cells[5]).toHaveTextContent("—"); // 終了
    expect(cells[6]).toHaveTextContent("—"); // 所要時間
  });

  it.each(["error", "crashed"])(
    "status=%sの行はrowDangerクラスで強調される",
    (status) => {
      const rows = [makeRow({ id: 42, status })];
      const { container } = render(
        <ExecutionsTable rows={rows} workflowNames={new Map()} />,
      );

      const highlighted = container.querySelector(`tr.${styles.rowDanger}`);
      expect(highlighted).toBeInTheDocument();
      expect(highlighted).toHaveTextContent(status);
    },
  );

  it("status=successの行は強調クラスを持たない", () => {
    const rows = [makeRow({ status: "success" })];
    const { container } = render(
      <ExecutionsTable rows={rows} workflowNames={new Map()} />,
    );

    expect(container.querySelector(`tr.${styles.rowDanger}`)).not.toBeInTheDocument();
  });

  it("statusがnullの行は強調されず、バッジに「unknown」を表示する", () => {
    const rows = [makeRow({ status: null })];
    const { container } = render(
      <ExecutionsTable rows={rows} workflowNames={new Map()} />,
    );

    expect(container.querySelector(`tr.${styles.rowDanger}`)).not.toBeInTheDocument();
    expect(screen.getByText("unknown")).toBeInTheDocument();
  });

  it("複数行を渡した場合、行数分のtr要素が生成される", () => {
    const rows = [
      makeRow({ id: 1 }),
      makeRow({ id: 2, status: "error" }),
      makeRow({ id: 3, status: "crashed" }),
    ];
    const { container } = render(
      <ExecutionsTable rows={rows} workflowNames={new Map()} />,
    );

    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(container.querySelectorAll(`tr.${styles.rowDanger}`)).toHaveLength(2);
  });
});
