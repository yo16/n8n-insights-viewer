import { buildShellCommandLine, GcloudCommandRunner } from "../../../scripts/sync/commandRunner";
import { buildCpuMetricsCommand } from "../../../scripts/sync/collectMetricsCommands";
import type { GcloudSyncConfig } from "../../../scripts/sync/config";

/**
 * commandRunner.ts の単体テスト。
 *
 * 目的: Windowsで `spawn(command, args, { shell: true })` を使うと、Nodeが
 * 引数配列をエスケープせず空白連結してcmd.exeに渡してしまい（DEP0190）、
 * スペースを含む引数（例: `--command="mkdir -p '/tmp/x' && ..."`）が
 * cmd.exe側で再分解されて壊れる問題を防ぐための `buildShellCommandLine` を検証する。
 */
describe("buildShellCommandLine", () => {
  it("空白を含む引数はダブルクォートで囲む", () => {
    const commandLine = buildShellCommandLine("gcloud", [
      "compute",
      "ssh",
      "--command=mkdir -p '/tmp/n8n_insights_sync' && sudo cp a b",
    ]);
    expect(commandLine).toBe(
      'gcloud compute ssh "--command=mkdir -p \'/tmp/n8n_insights_sync\' && sudo cp a b"'
    );
  });

  it("空白・特殊文字を含まない引数はそのまま連結する", () => {
    const commandLine = buildShellCommandLine("gcloud", [
      "compute",
      "ssh",
      "--zone=us-central1-c",
      "--project=my-project",
    ]);
    expect(commandLine).toBe("gcloud compute ssh --zone=us-central1-c --project=my-project");
  });

  it("空文字引数は \"\" になる", () => {
    const commandLine = buildShellCommandLine("gcloud", ["compute", ""]);
    expect(commandLine).toBe('gcloud compute ""');
  });

  it.each(["&", "|", "<", ">", "^", "'", "(", ")"])(
    "特殊文字 %s を含む引数もダブルクォートで囲む",
    (specialChar) => {
      const commandLine = buildShellCommandLine("gcloud", [`a${specialChar}b`]);
      expect(commandLine).toBe(`gcloud "a${specialChar}b"`);
    }
  );

  it("ダブルクォートのみを含む引数（cmdメタ文字なし）は\\\"にエスケープしてクォートで囲む", () => {
    const filter = 'metric.type="compute.googleapis.com/instance/cpu/utilization" AND resource.labels.zone="test-zone"';
    const commandLine = buildShellCommandLine("gcloud", [`--filter=${filter}`]);
    expect(commandLine).toBe(`gcloud "--filter=metric.type=\\"compute.googleapis.com/instance/cpu/utilization\\" AND resource.labels.zone=\\"test-zone\\""`);
  });

  it("ダブルクォートとcmdメタ文字（&|<>^）を両方含む引数は例外を投げる", () => {
    expect(() => buildShellCommandLine("gcloud", ['--command="echo hi" && sudo cp a b'])).toThrow();
  });

  it.each(["&", "|", "<", ">", "^"])(
    "ダブルクォートとメタ文字 %s の組み合わせは例外を投げる",
    (metaChar) => {
      expect(() => buildShellCommandLine("gcloud", [`a"b${metaChar}c`])).toThrow();
    }
  );

  it("commandにダブルクォートとcmdメタ文字を両方含む場合も例外を投げる", () => {
    expect(() => buildShellCommandLine('gc"lo&ud', [])).toThrow();
  });
});

/**
 * 統合テスト: buildCpuMetricsCommand（方式C, GCP Monitoringの--filter引数）が
 * 実際に出力する引数が buildShellCommandLine を例外なく通り、
 * --filter内の " が \" にエスケープされることを検証する。
 */
describe("buildShellCommandLine × buildCpuMetricsCommand（統合）", () => {
  it("--filter引数のダブルクォートが例外にならずエスケープされる", () => {
    const config: GcloudSyncConfig = {
      project: "test-project",
      zone: "test-zone",
      instance: "test-instance",
      remoteDbPath: "/root/n8n/.n8n/database.sqlite",
      remoteTmpDir: "/tmp/n8n_insights_sync",
    };
    const plan = buildCpuMetricsCommand(config, "2026-07-10T00:00:00Z", "2026-07-11T00:00:00Z");

    expect(() => buildShellCommandLine(plan.command, plan.args)).not.toThrow();

    const commandLine = buildShellCommandLine(plan.command, plan.args);
    const filterArg = plan.args.find((arg) => arg.startsWith("--filter="));
    expect(filterArg).toBeDefined();
    // 元の引数内の " がすべて \" にエスケープされた状態で1つの引数として含まれる
    const expectedEscaped = `"${filterArg!.replace(/"/g, '\\"')}"`;
    expect(commandLine).toContain(expectedEscaped);
  });

  it("実プロセス往復: --filter風のダブルクォート入り引数がスペース・\"を保ったまま1引数として届く", async () => {
    const runner = new GcloudCommandRunner();
    const nodePath = process.execPath;
    const script = "console.log(JSON.stringify(process.argv.slice(1)))";
    const filterLikeArg =
      '--filter=metric.type="compute.googleapis.com/instance/cpu/utilization" AND resource.labels.zone="test-zone"';

    const result = await runner.run(nodePath, ["-e", script, "--", filterLikeArg]);

    expect(result.exitCode).toBe(0);
    const receivedArgs = JSON.parse(result.stdout.trim()) as string[];
    expect(receivedArgs).toEqual([filterLikeArg]);
  });
});

/**
 * 実挙動の確認: gcloudは使わず、node -e で無害なローカルコマンドを
 * GcloudCommandRunner経由で実行し、スペース入り引数が1つの引数として
 * 届くことを確認する（実際の子プロセス起動を伴う唯一のテスト）。
 */
describe("GcloudCommandRunner（実プロセス経由の往復確認）", () => {
  it("スペースを含む引数が1つの引数としてそのまま子プロセスに渡る", async () => {
    const runner = new GcloudCommandRunner();
    const nodePath = process.execPath;
    const script = "console.log(JSON.stringify(process.argv.slice(1)))";
    const spaceyArg = "--command=mkdir -p '/tmp/n8n_insights_sync' && sudo cp a b";

    // "--" はnode自身に「以降はスクリプトへの引数」と伝えるための区切り
    // （無いと "--command=..." がnode自身の不明オプションとして扱われる）。
    const result = await runner.run(nodePath, ["-e", script, "--", spaceyArg]);

    expect(result.exitCode).toBe(0);
    const receivedArgs = JSON.parse(result.stdout.trim()) as string[];
    expect(receivedArgs).toEqual([spaceyArg]);
  });
});
