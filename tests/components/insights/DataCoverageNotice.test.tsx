import { render, screen } from "@testing-library/react";
import { DataCoverageNotice } from "@/components/insights/DataCoverageNotice";

/**
 * src/components/insights/DataCoverageNotice.tsx の単体テスト。
 *
 * 「データはここまで」注記（要件 §6.2 / frontend-design.md §7）の表示条件と内容を検証する。
 */
describe("DataCoverageNotice", () => {
  it("最終データ日が今日より前の場合、注記と最終データ日を表示する", () => {
    render(<DataCoverageNotice lastDataDayKey="2026-07-05" todayDayKey="2026-07-10" />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "データはここまで（最終データ日: 2026-07-05）。それ以降は同期未実行のため空白です。",
    );
  });

  it("同期状況確認ページへのリンクを表示する", () => {
    render(<DataCoverageNotice lastDataDayKey="2026-07-05" todayDayKey="2026-07-10" />);

    const link = screen.getByRole("link", { name: "同期状況を確認する" });
    expect(link).toHaveAttribute("href", "/sync");
  });

  it("最終データ日が今日と同じ場合は何も表示しない（同期が今日まで届いている）", () => {
    const { container } = render(
      <DataCoverageNotice lastDataDayKey="2026-07-10" todayDayKey="2026-07-10" />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("最終データ日が今日より後（想定外だが安全側）でも表示しない", () => {
    const { container } = render(
      <DataCoverageNotice lastDataDayKey="2026-07-11" todayDayKey="2026-07-10" />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
