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

  it("ダブルクォートを含む引数は例外を投げる", () => {
    expect(() => buildShellCommandLine("gcloud", ['--command="echo hi"'])).toThrow();
  });

  it("commandにダブルクォートを含む場合も例外を投げる", () => {
    expect(() => buildShellCommandLine('gc"loud', [])).toThrow();
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
