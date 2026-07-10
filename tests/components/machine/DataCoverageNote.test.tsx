import { render, screen } from "@testing-library/react";
import { DataCoverageNote } from "@/components/machine/DataCoverageNote";

describe("DataCoverageNote", () => {
  it("latestSampleUtcがnullの場合、全期間未収集メッセージを表示する", () => {
    render(<DataCoverageNote latestSampleUtc={null} inRangeHasData={false} />);

    expect(
      screen.getByText("マシン負荷データが全期間で未収集です。同期を実行すると取得できます。"),
    ).toBeInTheDocument();
  });

  it("latestSampleUtcはあるがinRangeHasDataがfalseの場合、期間内なしメッセージを最終サンプル時刻付きで表示する", () => {
    render(
      <DataCoverageNote
        latestSampleUtc="2026-07-10T02:10:00.000Z"
        inRangeHasData={false}
      />,
    );

    const note = screen.getByRole("note");
    expect(note.textContent).toContain("選択期間内にはマシン負荷データがありません");
    expect(note.textContent).toContain("2026-07-10 11:10 JST");
  });

  it("latestSampleUtcがありinRangeHasDataがtrueの場合、通常の末尾注記を表示する", () => {
    render(
      <DataCoverageNote
        latestSampleUtc="2026-07-10T02:10:00.000Z"
        inRangeHasData={true}
      />,
    );

    const note = screen.getByRole("note");
    expect(note.textContent).toContain("データはここまで");
    expect(note.textContent).toContain("2026-07-10 11:10 JST");
  });
});
