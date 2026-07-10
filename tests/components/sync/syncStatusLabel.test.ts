import { formatSyncStatusLabel } from "@/components/sync/syncStatusLabel";

describe("formatSyncStatusLabel", () => {
  it.each([
    ["running", "実行中"],
    ["success", "成功"],
    ["failed", "失敗"],
    ["aborted", "中断"],
  ])("status=%sのとき「%s」を返す", (status, label) => {
    expect(formatSyncStatusLabel(status)).toBe(label);
  });

  it("未知のstatusの場合は入力値をそのまま返す", () => {
    expect(formatSyncStatusLabel("unknown-status")).toBe("unknown-status");
  });

  it("空文字の場合は空文字をそのまま返す", () => {
    expect(formatSyncStatusLabel("")).toBe("");
  });
});
