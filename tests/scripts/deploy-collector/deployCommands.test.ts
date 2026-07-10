import {
  buildChmodCommand,
  buildMkdirCommand,
  buildReadCrontabCommand,
  buildScpUploadCommand,
  buildVerifyCommand,
  buildWriteCrontabCommand,
} from "../../../scripts/deploy-collector/deployCommands";
import type { GcloudSyncConfig } from "../../../scripts/sync/config";

const config: GcloudSyncConfig = {
  project: "automation-n8n-445800",
  zone: "us-central1-c",
  instance: "instance-20241225-025109-n8n",
  remoteDbPath: "/root/n8n/.n8n/database.sqlite",
  remoteTmpDir: "/tmp/n8n_insights_sync",
};

const REMOTE_DIR = "/root/insights_collector";
const REMOTE_SCRIPT_PATH = `${REMOTE_DIR}/collector.sh`;

describe("deployCommands（コマンド組み立て・実行は行わない）", () => {
  it("buildMkdirCommand: gcloud compute sshでmkdir -pのみを実行する", () => {
    const cmd = buildMkdirCommand(config, REMOTE_DIR);
    expect(cmd.command).toBe("gcloud");
    expect(cmd.args).toEqual([
      "compute",
      "ssh",
      config.instance,
      `--project=${config.project}`,
      `--zone=${config.zone}`,
      "--command",
      `mkdir -p '${REMOTE_DIR}'`,
    ]);
  });

  it("buildScpUploadCommand: ローカルファイルをVM上のcollector.shへ転送する", () => {
    const cmd = buildScpUploadCommand(
      config,
      "C:\\temp\\collector.sh",
      REMOTE_SCRIPT_PATH,
    );
    expect(cmd.command).toBe("gcloud");
    expect(cmd.args).toEqual([
      "compute",
      "scp",
      "C:\\temp\\collector.sh",
      `${config.instance}:${REMOTE_SCRIPT_PATH}`,
      `--project=${config.project}`,
      `--zone=${config.zone}`,
    ]);
  });

  it("buildChmodCommand: chmod +xのみを実行する", () => {
    const cmd = buildChmodCommand(config, REMOTE_SCRIPT_PATH);
    expect(cmd.args).toContain("--command");
    expect(cmd.args[cmd.args.length - 1]).toBe(
      `chmod +x '${REMOTE_SCRIPT_PATH}'`,
    );
  });

  it("buildReadCrontabCommand: crontab -lを読み取り専用で実行する（失敗を許容）", () => {
    const cmd = buildReadCrontabCommand(config);
    expect(cmd.args[cmd.args.length - 1]).toBe(
      "crontab -l 2>/dev/null || true",
    );
  });

  it("buildWriteCrontabCommand: base64往復でcrontab内容を安全に書き戻す", () => {
    const content = "0 3 * * * /usr/local/bin/backup.sh\n17 * * * * /root/insights_collector/collector.sh\n";
    const cmd = buildWriteCrontabCommand(config, content);
    const commandStr = cmd.args[cmd.args.length - 1];
    const base64Match = /^echo '([^']+)' \| base64 -d \| crontab -$/.exec(
      commandStr,
    );
    expect(base64Match).not.toBeNull();
    const decoded = Buffer.from(base64Match![1], "base64").toString("utf8");
    expect(decoded).toBe(content);
  });

  it("buildVerifyCommand: スクリプト存在とcrontab行の両方を検証する", () => {
    const cmd = buildVerifyCommand(config, REMOTE_SCRIPT_PATH);
    const commandStr = cmd.args[cmd.args.length - 1];
    expect(commandStr).toContain("SCRIPT_OK");
    expect(commandStr).toContain("SCRIPT_MISSING");
    expect(commandStr).toContain("CRON_OK");
    expect(commandStr).toContain("CRON_MISSING");
    expect(commandStr).toContain(REMOTE_SCRIPT_PATH);
  });

  it("すべてのコマンドがgcloud経由であり、apt/curl/wget等の新規ソフト導入を含まない", () => {
    const commands = [
      buildMkdirCommand(config, REMOTE_DIR),
      buildScpUploadCommand(config, "/tmp/local.sh", REMOTE_SCRIPT_PATH),
      buildChmodCommand(config, REMOTE_SCRIPT_PATH),
      buildReadCrontabCommand(config),
      buildWriteCrontabCommand(config, "dummy\n"),
      buildVerifyCommand(config, REMOTE_SCRIPT_PATH),
    ];
    for (const cmd of commands) {
      expect(cmd.command).toBe("gcloud");
      const joined = cmd.args.join(" ");
      expect(joined).not.toMatch(/\bapt(-get)?\s+install\b/);
      expect(joined).not.toMatch(/\bcurl\b/);
      expect(joined).not.toMatch(/\bwget\b/);
    }
  });
});
