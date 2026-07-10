import { mergeCrontab } from "../../../scripts/deploy-collector/crontab";

const MARKER = "/root/insights_collector/collector.sh";
const CRON_LINE = `17 * * * * ${MARKER}`;

describe("mergeCrontab", () => {
  it("空のcrontabに新しい行を追加する", () => {
    const result = mergeCrontab("", CRON_LINE, MARKER);
    expect(result).toBe(`${CRON_LINE}\n`);
  });

  it("既存の無関係な行はすべて保持し、collector行だけを末尾に追加する", () => {
    const existing = [
      "# 既存のバックアップジョブ",
      "0 3 * * * /usr/local/bin/backup.sh",
      "",
      "30 2 * * 0 /usr/local/bin/weekly-cleanup.sh",
    ].join("\n");

    const result = mergeCrontab(existing, CRON_LINE, MARKER);

    expect(result).toBe(
      [
        "# 既存のバックアップジョブ",
        "0 3 * * * /usr/local/bin/backup.sh",
        "",
        "30 2 * * 0 /usr/local/bin/weekly-cleanup.sh",
        CRON_LINE,
      ].join("\n") + "\n",
    );
  });

  it("既存のcollector行があれば置換し、重複させない（冪等）", () => {
    const existing = [
      "0 3 * * * /usr/local/bin/backup.sh",
      `0 * * * * ${MARKER}`, // 旧バージョン（分が違う）
    ].join("\n");

    const result = mergeCrontab(existing, CRON_LINE, MARKER);

    expect(result).toBe(
      ["0 3 * * * /usr/local/bin/backup.sh", CRON_LINE].join("\n") + "\n",
    );
    // collector行は1つだけ
    const occurrences = result.split("\n").filter((l) => l.includes(MARKER));
    expect(occurrences).toHaveLength(1);
  });

  it("同一内容を2回マージしても結果が変わらない（冪等性）", () => {
    const existing = "0 3 * * * /usr/local/bin/backup.sh";
    const once = mergeCrontab(existing, CRON_LINE, MARKER);
    const twice = mergeCrontab(once, CRON_LINE, MARKER);
    expect(twice).toBe(once);
  });

  it("末尾の改行の有無に関わらず既存行を保持する", () => {
    const existingWithTrailingNewline = "0 3 * * * /usr/local/bin/backup.sh\n";
    const result = mergeCrontab(existingWithTrailingNewline, CRON_LINE, MARKER);
    expect(result).toBe(
      ["0 3 * * * /usr/local/bin/backup.sh", CRON_LINE].join("\n") + "\n",
    );
  });

  it("複数のcollector行が紛れ込んでいても全て置換して1行にする", () => {
    const existing = [
      "0 3 * * * /usr/local/bin/backup.sh",
      `0 * * * * ${MARKER}`,
      `10 * * * * ${MARKER}`,
    ].join("\n");

    const result = mergeCrontab(existing, CRON_LINE, MARKER);
    const occurrences = result.split("\n").filter((l) => l.includes(MARKER));
    expect(occurrences).toHaveLength(1);
    expect(result).toContain("0 3 * * * /usr/local/bin/backup.sh");
  });
});
