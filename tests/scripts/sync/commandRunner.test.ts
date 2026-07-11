import { buildShellCommandLine, GcloudCommandRunner } from "../../../scripts/sync/commandRunner";

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
 * 実プロセス往復テスト: ダブルクォートを含む引数（他のgcloudサブコマンドの
 * `--filter` 等で今後も使われうる形）が、スペース・`"` を保ったまま
 * 1つの引数として子プロセスに届くことを確認する。
 *
 * 方式C（CPU使用率取得）自体は現在Cloud Monitoring REST APIをfetchで直接呼ぶ方式に
 * 変更されており、`--filter` を含むgcloudコマンドは組み立てていない
 * （`gcloud monitoring time-series list` は実在しないサブコマンドだったため）。
 * `buildShellCommandLine` 自体の引用符エスケープ機能は他のコマンドでも使われるため、
 * このテストは汎用的な確認として残す。
 */
describe("buildShellCommandLine（ダブルクォート入り引数の実プロセス往復）", () => {
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
