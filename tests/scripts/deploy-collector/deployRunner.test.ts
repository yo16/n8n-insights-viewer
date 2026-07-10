import { runDeployCollector } from "../../../scripts/deploy-collector/deployRunner";
import type { DeployCollectorConfig } from "../../../scripts/deploy-collector/deployConfig";
import type { GcloudSyncConfig } from "../../../scripts/sync/config";
import { FakeCommandRunner } from "../sync/fakes/fakeCommandRunner";

const gcloudConfig: GcloudSyncConfig = {
  project: "automation-n8n-445800",
  zone: "us-central1-c",
  instance: "instance-20241225-025109-n8n",
  remoteDbPath: "/root/n8n/.n8n/database.sqlite",
  remoteTmpDir: "/tmp/n8n_insights_sync",
};

const deployConfig: DeployCollectorConfig = {
  remoteDir: "/root/insights_collector",
  remoteScriptPath: "/root/insights_collector/collector.sh",
  remoteOutputPath: "/root/insights_collector/metrics.jsonl",
  collectorVersion: "collector-1",
  remoteDbPath: "/root/n8n/.n8n/database.sqlite",
  cronMinute: 17,
  cronLine: "17 * * * * /root/insights_collector/collector.sh",
};

const TEMPLATE = "V=__COLLECTOR_VERSION__\nDB=__DB_PATH__\nOUT=__OUTPUT_FILE__\nexit 0\n";

function makeLogger() {
  const lines: string[] = [];
  return { log: (message: string) => lines.push(message), lines };
}

describe("runDeployCollector（dry-run）", () => {
  it("--dry-run相当のときはプランを表示するのみで、承認確認・gcloud実行・一時ファイル書き出しを一切行わない", async () => {
    const runner = new FakeCommandRunner();
    const logger = makeLogger();
    const confirm = jest.fn();
    const writeLocalTempFile = jest.fn();

    const result = await runDeployCollector({
      runner,
      templateContent: TEMPLATE,
      gcloudConfig,
      deployConfig,
      dryRun: true,
      confirm,
      log: logger.log,
      writeLocalTempFile,
    });

    expect(result.status).toBe("planned");
    expect(confirm).not.toHaveBeenCalled();
    expect(writeLocalTempFile).not.toHaveBeenCalled();
    expect(runner.calls).toHaveLength(0);
    expect(logger.lines.join("\n")).toContain("設置プラン");
    expect(logger.lines.join("\n")).toContain(deployConfig.remoteScriptPath);
    expect(logger.lines.join("\n")).toContain(deployConfig.cronLine);
  });
});

describe("runDeployCollector（承認フロー）", () => {
  it("ユーザーが承認しない場合（confirm=false）は何も実行せず中止する", async () => {
    const runner = new FakeCommandRunner();
    const logger = makeLogger();
    const writeLocalTempFile = jest.fn();

    const result = await runDeployCollector({
      runner,
      templateContent: TEMPLATE,
      gcloudConfig,
      deployConfig,
      confirm: async () => false,
      log: logger.log,
      writeLocalTempFile,
    });

    expect(result.status).toBe("aborted");
    expect(writeLocalTempFile).not.toHaveBeenCalled();
    expect(runner.calls).toHaveLength(0);
    expect(logger.lines.join("\n")).toContain("承認しなかった");
  });
});

describe("runDeployCollector（承認後の実行フロー）", () => {
  it("mkdir→scp→chmod→crontab読み取り→crontab書き戻し→検証の順でコマンドを実行する", async () => {
    const existingCrontab = "0 3 * * * /usr/local/bin/backup.sh\n";
    const runner = new FakeCommandRunner([
      { stdout: "", stderr: "", exitCode: 0 }, // mkdir
      { stdout: "", stderr: "", exitCode: 0 }, // scp
      { stdout: "", stderr: "", exitCode: 0 }, // chmod
      { stdout: existingCrontab, stderr: "", exitCode: 0 }, // read crontab
      { stdout: "", stderr: "", exitCode: 0 }, // write crontab
      { stdout: "SCRIPT_OK\nCRON_OK\n", stderr: "", exitCode: 0 }, // verify
    ]);
    const logger = makeLogger();
    const localTempFile = "/tmp/rendered-collector.sh";
    const writeLocalTempFile = jest.fn().mockResolvedValue(localTempFile);
    const removeLocalTempFile = jest.fn().mockResolvedValue(undefined);

    const result = await runDeployCollector({
      runner,
      templateContent: TEMPLATE,
      gcloudConfig,
      deployConfig,
      confirm: async () => true,
      log: logger.log,
      writeLocalTempFile,
      removeLocalTempFile,
    });

    expect(result.status).toBe("success");
    expect(runner.calls).toHaveLength(6);

    // 1. mkdir -p
    expect(runner.calls[0].args).toContain(`mkdir -p '${deployConfig.remoteDir}'`);
    // 2. scp（レンダリング済みローカル一時ファイル → リモートパス）
    expect(runner.calls[1].args).toContain("scp");
    expect(runner.calls[1].args).toContain(localTempFile);
    expect(runner.calls[1].args).toContain(
      `${gcloudConfig.instance}:${deployConfig.remoteScriptPath}`,
    );
    // 3. chmod +x
    expect(runner.calls[2].args).toContain(
      `chmod +x '${deployConfig.remoteScriptPath}'`,
    );
    // 4. crontab読み取り
    expect(runner.calls[3].args).toContain("crontab -l 2>/dev/null || true");
    // 5. crontab書き戻し（既存内容を保持したまま冪等マージされていること）
    const writeCommandStr = runner.calls[4].args[runner.calls[4].args.length - 1];
    const base64Match = /echo '([^']+)' \| base64 -d \| crontab -/.exec(
      writeCommandStr,
    );
    expect(base64Match).not.toBeNull();
    const decoded = Buffer.from(base64Match![1], "base64").toString("utf8");
    expect(decoded).toBe(
      `0 3 * * * /usr/local/bin/backup.sh\n${deployConfig.cronLine}\n`,
    );
    // 6. 検証
    expect(runner.calls[5].args.join(" ")).toContain(
      deployConfig.remoteScriptPath,
    );

    expect(writeLocalTempFile).toHaveBeenCalledWith(
      expect.stringContaining("V=collector-1"),
    );
    expect(removeLocalTempFile).toHaveBeenCalledWith(localTempFile);
    expect(logger.lines.join("\n")).toContain("アンインストール手順");
  });

  it("既存のcollector行があれば重複させず置換する（冪等）", async () => {
    const staleCronLine = "0 * * * * /root/insights_collector/collector.sh";
    const existingCrontab = `0 3 * * * /usr/local/bin/backup.sh\n${staleCronLine}\n`;
    const runner = new FakeCommandRunner([
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: existingCrontab, stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "SCRIPT_OK\nCRON_OK\n", stderr: "", exitCode: 0 },
    ]);
    const logger = makeLogger();

    await runDeployCollector({
      runner,
      templateContent: TEMPLATE,
      gcloudConfig,
      deployConfig,
      confirm: async () => true,
      log: logger.log,
      writeLocalTempFile: async () => "/tmp/rendered.sh",
      removeLocalTempFile: async () => undefined,
    });

    const writeCommandStr = runner.calls[4].args[runner.calls[4].args.length - 1];
    const base64Match = /echo '([^']+)' \| base64 -d \| crontab -/.exec(
      writeCommandStr,
    );
    const decoded = Buffer.from(base64Match![1], "base64").toString("utf8");

    expect(decoded).toBe(
      `0 3 * * * /usr/local/bin/backup.sh\n${deployConfig.cronLine}\n`,
    );
    expect(decoded).not.toContain(staleCronLine);
    const occurrences = decoded
      .split("\n")
      .filter((l) => l.includes(deployConfig.remoteScriptPath));
    expect(occurrences).toHaveLength(1);
  });

  it("途中のコマンドが失敗した場合はfailedを返し、一時ファイルは必ず削除する", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "", stderr: "permission denied", exitCode: 1 }, // mkdir失敗
    ]);
    const logger = makeLogger();
    const removeLocalTempFile = jest.fn().mockResolvedValue(undefined);

    const result = await runDeployCollector({
      runner,
      templateContent: TEMPLATE,
      gcloudConfig,
      deployConfig,
      confirm: async () => true,
      log: logger.log,
      writeLocalTempFile: async () => "/tmp/rendered.sh",
      removeLocalTempFile,
    });

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toContain("ディレクトリの作成に失敗");
    // mkdirのみ実行され、以降のコマンド（scp/chmod/crontab等）は実行されない
    expect(runner.calls).toHaveLength(1);
    expect(removeLocalTempFile).toHaveBeenCalledWith("/tmp/rendered.sh");
  });

  it("scpが失敗した場合はfailedを返し、chmod以降は実行されず一時ファイルは削除する", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "", stderr: "", exitCode: 0 }, // mkdir成功
      { stdout: "", stderr: "scp: connection refused", exitCode: 1 }, // scp失敗
    ]);
    const logger = makeLogger();
    const removeLocalTempFile = jest.fn().mockResolvedValue(undefined);

    const result = await runDeployCollector({
      runner,
      templateContent: TEMPLATE,
      gcloudConfig,
      deployConfig,
      confirm: async () => true,
      log: logger.log,
      writeLocalTempFile: async () => "/tmp/rendered.sh",
      removeLocalTempFile,
    });

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toContain("collector.shの転送に失敗");
    expect(result.errorMessage).toContain("connection refused");
    // mkdir・scpのみ実行され、chmod以降（crontab読み取り/書き戻し/検証）は実行されない
    expect(runner.calls).toHaveLength(2);
    expect(removeLocalTempFile).toHaveBeenCalledWith("/tmp/rendered.sh");
  });

  it("chmodが失敗した場合はfailedを返し、crontab関連コマンドは実行されない", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "", stderr: "", exitCode: 0 }, // mkdir成功
      { stdout: "", stderr: "", exitCode: 0 }, // scp成功
      { stdout: "", stderr: "chmod: no such file", exitCode: 1 }, // chmod失敗
    ]);
    const logger = makeLogger();
    const removeLocalTempFile = jest.fn().mockResolvedValue(undefined);

    const result = await runDeployCollector({
      runner,
      templateContent: TEMPLATE,
      gcloudConfig,
      deployConfig,
      confirm: async () => true,
      log: logger.log,
      writeLocalTempFile: async () => "/tmp/rendered.sh",
      removeLocalTempFile,
    });

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toContain("実行権限の付与に失敗");
    // mkdir・scp・chmodのみ実行され、crontab読み取り以降は実行されない
    expect(runner.calls).toHaveLength(3);
    expect(removeLocalTempFile).toHaveBeenCalledWith("/tmp/rendered.sh");
  });

  it("crontab読み取りが失敗（exitCode!==0）した場合は書き戻しを一切行わずfailedを返す（既存crontab全消し防止）", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "", stderr: "", exitCode: 0 }, // mkdir成功
      { stdout: "", stderr: "", exitCode: 0 }, // scp成功
      { stdout: "", stderr: "", exitCode: 0 }, // chmod成功
      {
        stdout: "",
        stderr: "ssh: connection timed out",
        exitCode: 255,
      }, // crontab読み取り失敗（ssh自体の失敗を想定。crontab未設定時は||trueでexitCode 0になる契約）
    ]);
    const logger = makeLogger();
    const removeLocalTempFile = jest.fn().mockResolvedValue(undefined);

    const result = await runDeployCollector({
      runner,
      templateContent: TEMPLATE,
      gcloudConfig,
      deployConfig,
      confirm: async () => true,
      log: logger.log,
      writeLocalTempFile: async () => "/tmp/rendered.sh",
      removeLocalTempFile,
    });

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toContain("既存crontabの読み取りに失敗");
    // crontab読み取りコマンドまでのみ実行され、書き戻し・検証コマンドは一切実行されない
    expect(runner.calls).toHaveLength(4);
    expect(removeLocalTempFile).toHaveBeenCalledWith("/tmp/rendered.sh");
  });

  it("crontab書き戻しが失敗した場合はfailedを返し、検証コマンドは実行されない", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "", stderr: "", exitCode: 0 }, // mkdir成功
      { stdout: "", stderr: "", exitCode: 0 }, // scp成功
      { stdout: "", stderr: "", exitCode: 0 }, // chmod成功
      { stdout: "", stderr: "", exitCode: 0 }, // crontab読み取り成功（空）
      { stdout: "", stderr: "crontab: permission denied", exitCode: 1 }, // crontab書き戻し失敗
    ]);
    const logger = makeLogger();
    const removeLocalTempFile = jest.fn().mockResolvedValue(undefined);

    const result = await runDeployCollector({
      runner,
      templateContent: TEMPLATE,
      gcloudConfig,
      deployConfig,
      confirm: async () => true,
      log: logger.log,
      writeLocalTempFile: async () => "/tmp/rendered.sh",
      removeLocalTempFile,
    });

    expect(result.status).toBe("failed");
    expect(result.errorMessage).toContain("crontabの更新に失敗");
    // 書き戻しまでのみ実行され、検証コマンドは実行されない
    expect(runner.calls).toHaveLength(5);
    expect(removeLocalTempFile).toHaveBeenCalledWith("/tmp/rendered.sh");
  });

  it("検証結果がSCRIPT_MISSING/CRON_MISSINGの場合は成功扱いのまま警告ログを出す", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "", stderr: "", exitCode: 0 }, // mkdir成功
      { stdout: "", stderr: "", exitCode: 0 }, // scp成功
      { stdout: "", stderr: "", exitCode: 0 }, // chmod成功
      { stdout: "", stderr: "", exitCode: 0 }, // crontab読み取り成功（空）
      { stdout: "", stderr: "", exitCode: 0 }, // crontab書き戻し成功
      { stdout: "SCRIPT_MISSING\nCRON_MISSING\n", stderr: "", exitCode: 0 }, // 検証: 両方NG
    ]);
    const logger = makeLogger();

    const result = await runDeployCollector({
      runner,
      templateContent: TEMPLATE,
      gcloudConfig,
      deployConfig,
      confirm: async () => true,
      log: logger.log,
      writeLocalTempFile: async () => "/tmp/rendered.sh",
      removeLocalTempFile: async () => undefined,
    });

    // 検証失敗は同期全体を失敗させない設計（設置コマンド自体は成功しているため）。
    // ただし警告ログを必ず出す。
    expect(result.status).toBe("success");
    expect(runner.calls).toHaveLength(6);
    const output = logger.lines.join("\n");
    expect(output).toContain("検証で警告があります");
    expect(output).toContain("script_ok=false");
    expect(output).toContain("cron_ok=false");
  });

  it("検証結果がSCRIPT_OKのみでCRON_MISSINGの場合も警告ログを出す", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 },
      { stdout: "SCRIPT_OK\nCRON_MISSING\n", stderr: "", exitCode: 0 },
    ]);
    const logger = makeLogger();

    const result = await runDeployCollector({
      runner,
      templateContent: TEMPLATE,
      gcloudConfig,
      deployConfig,
      confirm: async () => true,
      log: logger.log,
      writeLocalTempFile: async () => "/tmp/rendered.sh",
      removeLocalTempFile: async () => undefined,
    });

    expect(result.status).toBe("success");
    const output = logger.lines.join("\n");
    expect(output).toContain("script_ok=true");
    expect(output).toContain("cron_ok=false");
  });
});
