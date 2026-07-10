import {
  buildInstallScriptCommand,
  buildMkdirCommand,
  buildReadCrontabCommand,
  buildRemoteUploadTempName,
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
const REMOTE_UPLOAD_TEMP_NAME = "collector.sh.upload";

describe("deployCommands（コマンド組み立て・実行は行わない）", () => {
  it("buildRemoteUploadTempName: 設置先パスのベース名に.uploadを付与した相対名を返す", () => {
    expect(buildRemoteUploadTempName(REMOTE_SCRIPT_PATH)).toBe(
      REMOTE_UPLOAD_TEMP_NAME,
    );
  });

  it("buildMkdirCommand: gcloud compute sshで sudo mkdir -p のみを実行する（設置先が/root配下のため）", () => {
    const cmd = buildMkdirCommand(config, REMOTE_DIR);
    expect(cmd.command).toBe("gcloud");
    expect(cmd.args).toEqual([
      "compute",
      "ssh",
      config.instance,
      `--project=${config.project}`,
      `--zone=${config.zone}`,
      "--command",
      `sudo mkdir -p '${REMOTE_DIR}'`,
    ]);
  });

  it("buildScpUploadCommand: /root配下へ直接書けないため、SSHユーザーのホーム基準の相対パスへ転送する", () => {
    const cmd = buildScpUploadCommand(
      config,
      "C:\\temp\\collector.sh",
      REMOTE_UPLOAD_TEMP_NAME,
    );
    expect(cmd.command).toBe("gcloud");
    expect(cmd.args).toEqual([
      "compute",
      "scp",
      "C:\\temp\\collector.sh",
      `${config.instance}:${REMOTE_UPLOAD_TEMP_NAME}`,
      `--project=${config.project}`,
      `--zone=${config.zone}`,
    ]);
    // 転送先が絶対パス（/root配下）でないこと（ホーム基準の相対パスであること）
    const scpTarget = cmd.args[3];
    expect(scpTarget).not.toContain("/root");
  });

  it("buildInstallScriptCommand: sudo mvで設置先へ移動し、sudo chmod 755で実行権限を付与する", () => {
    const cmd = buildInstallScriptCommand(
      config,
      REMOTE_UPLOAD_TEMP_NAME,
      REMOTE_SCRIPT_PATH,
    );
    expect(cmd.args).toContain("--command");
    const commandStr = cmd.args[cmd.args.length - 1];
    expect(commandStr).toBe(
      `sudo mv '${REMOTE_UPLOAD_TEMP_NAME}' '${REMOTE_SCRIPT_PATH}' && sudo chmod 755 '${REMOTE_SCRIPT_PATH}'`,
    );
  });

  it("buildReadCrontabCommand: sudo crontab -lを読み取り専用で実行する（rootのcrontab・失敗を許容）", () => {
    const cmd = buildReadCrontabCommand(config);
    expect(cmd.args[cmd.args.length - 1]).toBe(
      "sudo crontab -l 2>/dev/null || true",
    );
  });

  it("buildWriteCrontabCommand: base64往復でrootのcrontab内容を安全に書き戻す", () => {
    const content = "0 3 * * * /usr/local/bin/backup.sh\n17 * * * * /root/insights_collector/collector.sh\n";
    const cmd = buildWriteCrontabCommand(config, content);
    const commandStr = cmd.args[cmd.args.length - 1];
    const base64Match = /^echo '([^']+)' \| base64 -d \| sudo crontab -$/.exec(
      commandStr,
    );
    expect(base64Match).not.toBeNull();
    const decoded = Buffer.from(base64Match![1], "base64").toString("utf8");
    expect(decoded).toBe(content);
  });

  it("buildVerifyCommand: sudo経由でスクリプト存在とcrontab行の両方を検証する", () => {
    const cmd = buildVerifyCommand(config, REMOTE_SCRIPT_PATH);
    const commandStr = cmd.args[cmd.args.length - 1];
    expect(commandStr).toContain("sudo test -x");
    expect(commandStr).toContain("SCRIPT_OK");
    expect(commandStr).toContain("SCRIPT_MISSING");
    expect(commandStr).toContain("sudo crontab -l");
    expect(commandStr).toContain("CRON_OK");
    expect(commandStr).toContain("CRON_MISSING");
    expect(commandStr).toContain(REMOTE_SCRIPT_PATH);
  });

  it("すべてのコマンドがgcloud経由であり、apt/curl/wget等の新規ソフト導入を含まない", () => {
    const commands = [
      buildMkdirCommand(config, REMOTE_DIR),
      buildScpUploadCommand(
        config,
        "/tmp/local.sh",
        REMOTE_UPLOAD_TEMP_NAME,
      ),
      buildInstallScriptCommand(
        config,
        REMOTE_UPLOAD_TEMP_NAME,
        REMOTE_SCRIPT_PATH,
      ),
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

  it("/root配下への書き込み系操作（mkdir/mv/chmod/crontab書き戻し）はすべてsudo付きである", () => {
    const writeCommands = [
      buildMkdirCommand(config, REMOTE_DIR),
      buildInstallScriptCommand(
        config,
        REMOTE_UPLOAD_TEMP_NAME,
        REMOTE_SCRIPT_PATH,
      ),
      buildWriteCrontabCommand(config, "dummy\n"),
    ];
    for (const cmd of writeCommands) {
      const commandStr = cmd.args[cmd.args.length - 1];
      expect(commandStr).toContain("sudo");
    }
  });

  it("sudoは許可コマンド（mkdir/mv/chmod/crontab/test）のみに限定され、それ以外のsudo対象コマンドは含まない", () => {
    const commands = [
      buildMkdirCommand(config, REMOTE_DIR),
      buildInstallScriptCommand(
        config,
        REMOTE_UPLOAD_TEMP_NAME,
        REMOTE_SCRIPT_PATH,
      ),
      buildReadCrontabCommand(config),
      buildWriteCrontabCommand(config, "dummy\n"),
      buildVerifyCommand(config, REMOTE_SCRIPT_PATH),
    ];
    const allowedSudoTargets = /sudo (mkdir|mv|chmod|crontab|test)\b/;
    for (const cmd of commands) {
      const commandStr = cmd.args[cmd.args.length - 1];
      const sudoOccurrences = commandStr.match(/sudo \S+/g) ?? [];
      for (const occurrence of sudoOccurrences) {
        expect(occurrence).toMatch(allowedSudoTargets);
      }
    }
  });
});
