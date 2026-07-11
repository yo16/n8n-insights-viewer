import {
  buildAccessTokenCommand,
  buildCpuMetricsRequestUrl,
  buildOomLogCommand,
  buildScpCollectorFileCommand,
  buildSpotMetricsCommand,
} from "../../../scripts/sync/collectMetricsCommands";
import type { GcloudSyncConfig } from "../../../scripts/sync/config";

/**
 * collectMetricsCommands.ts の単体テスト。
 *
 * **絶対厳守**: ここで組み立てられるコマンド列が読み取り専用のみで
 * 構成されていることを検証する（書き込み系コマンドを一切含まないこと）。
 * 実gcloudコマンドは一切実行しない（組み立て結果の文字列検証のみ）。
 */
describe("collectMetricsCommands", () => {
  const config: GcloudSyncConfig = {
    project: "test-project",
    zone: "test-zone",
    instance: "test-instance",
    remoteDbPath: "/root/n8n/.n8n/database.sqlite",
    remoteTmpDir: "/tmp/n8n_insights_sync",
  };

  /**
   * 書き込み系コマンドが含まれていないことを検証するヘルパー。
   * `2>/dev/null`（標準エラーの読み捨て）のみはリダイレクトの例外として許容する。
   */
  function expectReadOnly(remoteScript: string): void {
    const forbidden = [
      /\brm\s+-/, // rm -rf 等
      /\bmv\b/,
      /\bchmod\s+\+/,
      /\bcrontab\b/,
      />>/, // 追記リダイレクト
      /\bsudo\s+tee\b/,
      /\bmkdir\b/,
      /\btouch\b/,
    ];
    for (const pattern of forbidden) {
      expect(remoteScript).not.toMatch(pattern);
    }

    // "2>/dev/null" を除去したうえで、それ以外のリダイレクト(">")が無いこと
    const withoutStderrToNull = remoteScript.replace(/2>\/dev\/null/g, "");
    expect(withoutStderrToNull).not.toMatch(/>/);
  }

  describe("buildSpotMetricsCommand", () => {
    it("1コマンドにまとめたSSH実行として組み立てる", () => {
      const plan = buildSpotMetricsCommand(config);
      expect(plan.command).toBe("gcloud");
      expect(plan.args).toEqual(
        expect.arrayContaining(["compute", "ssh", "test-instance"]),
      );
      expect(plan.args).toEqual(
        expect.arrayContaining(["--project=test-project", "--zone=test-zone"]),
      );

      const commandIndex = plan.args.indexOf("--command");
      expect(commandIndex).toBeGreaterThanOrEqual(0);
      const script = plan.args[commandIndex + 1];

      expect(script).toContain("cat /proc/meminfo");
      expect(script).toContain("cat /proc/loadavg");
      expect(script).toContain("docker stats --no-stream");
      expect(script).toContain("stat -c%s");
      expect(script).toContain("df -B1");
      expectReadOnly(script);
    });
  });

  describe("buildOomLogCommand", () => {
    it("journalctl -k(無ければkern.log)からのgrepのみで構成する", () => {
      const plan = buildOomLogCommand(config);
      const commandIndex = plan.args.indexOf("--command");
      const script = plan.args[commandIndex + 1];

      expect(script).toContain("journalctl -k");
      expect(script).toContain("/var/log/kern.log");
      expect(script).toContain("grep -i 'killed process'");
      expectReadOnly(script);
    });
  });

  describe("buildScpCollectorFileCommand", () => {
    it("scpによるファイル取得のみを組み立てる(書き込みなし)", () => {
      const plan = buildScpCollectorFileCommand(
        config,
        "/root/insights_collector/metrics.jsonl",
        "C:\\tmp\\metrics.jsonl",
      );
      expect(plan.command).toBe("gcloud");
      expect(plan.args).toEqual(expect.arrayContaining(["compute", "scp"]));
      expect(
        plan.args.some((a) =>
          a.includes("test-instance:/root/insights_collector/metrics.jsonl"),
        ),
      ).toBe(true);
      expect(plan.args).toContain("C:\\tmp\\metrics.jsonl");
    });
  });

  describe("buildAccessTokenCommand", () => {
    it("gcloud auth print-access-token を読み取り専用で組み立てる", () => {
      const plan = buildAccessTokenCommand();
      expect(plan.command).toBe("gcloud");
      expect(plan.args).toEqual(["auth", "print-access-token"]);
      // 書き込み系フラグ（create/delete等）を含まないこと
      expect(plan.args.join(" ")).not.toMatch(/\b(create|delete|update)\b/);
    });
  });

  describe("buildCpuMetricsRequestUrl", () => {
    it("Cloud Monitoring REST API(timeSeries.list)のURLを組み立てる", () => {
      const url = buildCpuMetricsRequestUrl(
        config,
        "2026-07-01T00:00:00.000Z",
        "2026-07-10T00:00:00.000Z",
      );
      const parsed = new URL(url);

      expect(parsed.origin).toBe("https://monitoring.googleapis.com");
      expect(parsed.pathname).toBe("/v3/projects/test-project/timeSeries");
      expect(parsed.searchParams.get("filter")).toBe(
        'metric.type="compute.googleapis.com/instance/cpu/utilization" AND resource.labels.zone="test-zone"',
      );
      expect(parsed.searchParams.get("interval.startTime")).toBe(
        "2026-07-01T00:00:00.000Z",
      );
      expect(parsed.searchParams.get("interval.endTime")).toBe(
        "2026-07-10T00:00:00.000Z",
      );
      expect(parsed.searchParams.has("pageToken")).toBe(false);
    });

    it("filterに含まれるダブルクォート・空白・&等をURLエンコードする", () => {
      const url = buildCpuMetricsRequestUrl(
        config,
        "2026-07-01T00:00:00.000Z",
        "2026-07-10T00:00:00.000Z",
      );
      // URLとして生の " " や "&"(パラメータ区切り以外)がそのまま残っていないこと
      expect(url).not.toMatch(/filter=.*\s/);
      expect(url).toContain("filter=metric.type%3D%22compute");
    });

    it("pageTokenを指定するとクエリパラメータに追加される", () => {
      const url = buildCpuMetricsRequestUrl(
        config,
        "2026-07-01T00:00:00.000Z",
        "2026-07-10T00:00:00.000Z",
        "next-page-token-abc",
      );
      const parsed = new URL(url);
      expect(parsed.searchParams.get("pageToken")).toBe("next-page-token-abc");
    });
  });
});
