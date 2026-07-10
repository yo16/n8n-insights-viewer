import { buildFetchCommandPlan } from "../../../scripts/sync/gcloudCommands";
import type { GcloudSyncConfig } from "../../../scripts/sync/config";

/**
 * gcloudCommands.ts の単体テスト。
 *
 * 絶対厳守: このテストは純粋関数（コマンドの組み立て）のみを検証し、
 * 実際にgcloudコマンドを実行しない。
 */
describe("buildFetchCommandPlan", () => {
  const config: GcloudSyncConfig = {
    project: "test-project",
    zone: "test-zone",
    instance: "test-instance",
    remoteDbPath: "/root/n8n/.n8n/database.sqlite",
    remoteTmpDir: "/tmp/n8n_insights_sync",
  };

  const localRawDbPath = "C:/repo/data/raw/database.sqlite";
  const localRawWalPath = "C:/repo/data/raw/database.sqlite-wal";

  it("すべてのコマンドがgcloudである", () => {
    const plan = buildFetchCommandPlan(config, localRawDbPath, localRawWalPath);
    expect(plan.snapshot.command).toBe("gcloud");
    expect(plan.scpDb.command).toBe("gcloud");
    expect(plan.scpWal.command).toBe("gcloud");
    expect(plan.cleanupRemoteTmp.command).toBe("gcloud");
  });

  it("スナップショットはcompute sshでsudo cpのみを実行する", () => {
    const plan = buildFetchCommandPlan(config, localRawDbPath, localRawWalPath);
    expect(plan.snapshot.args[0]).toBe("compute");
    expect(plan.snapshot.args[1]).toBe("ssh");
    expect(plan.snapshot.args).toContain("test-instance");
    expect(plan.snapshot.args).toContain("--project=test-project");
    expect(plan.snapshot.args).toContain("--zone=test-zone");

    const commandIndex = plan.snapshot.args.indexOf("--command");
    expect(commandIndex).toBeGreaterThan(-1);
    const remoteScript = plan.snapshot.args[commandIndex + 1];

    // 読み取り系(sudo cp)・自分のtmp配下のchmodのみで構成されていること
    expect(remoteScript).toContain("mkdir -p '/tmp/n8n_insights_sync'");
    expect(remoteScript).toContain(
      "sudo cp '/root/n8n/.n8n/database.sqlite' '/tmp/n8n_insights_sync/database.sqlite'",
    );
    expect(remoteScript).toContain(
      "sudo cp '/root/n8n/.n8n/database.sqlite-wal' '/tmp/n8n_insights_sync/database.sqlite-wal'",
    );
    expect(remoteScript).toContain("sudo chmod 644");

    // 書き込み系コマンド（rm以外の削除・変更操作）を含まないこと
    expect(remoteScript).not.toMatch(/\bmv\b/);
    expect(remoteScript).not.toMatch(/\bdd\b/);
  });

  it("database.sqliteの取得はcompute scpで行う", () => {
    const plan = buildFetchCommandPlan(config, localRawDbPath, localRawWalPath);
    expect(plan.scpDb.args[0]).toBe("compute");
    expect(plan.scpDb.args[1]).toBe("scp");
    expect(plan.scpDb.args).toContain(
      "test-instance:/tmp/n8n_insights_sync/database.sqlite",
    );
    expect(plan.scpDb.args).toContain(localRawDbPath);
  });

  it("database.sqlite-walの取得はcompute scpで行う", () => {
    const plan = buildFetchCommandPlan(config, localRawDbPath, localRawWalPath);
    expect(plan.scpWal.args).toContain(
      "test-instance:/tmp/n8n_insights_sync/database.sqlite-wal",
    );
    expect(plan.scpWal.args).toContain(localRawWalPath);
  });

  it("後始末はサーバー側の自分のtmpディレクトリのみをrmする", () => {
    const plan = buildFetchCommandPlan(config, localRawDbPath, localRawWalPath);
    const commandIndex = plan.cleanupRemoteTmp.args.indexOf("--command");
    const remoteScript = plan.cleanupRemoteTmp.args[commandIndex + 1];
    expect(remoteScript).toBe("sudo rm -rf '/tmp/n8n_insights_sync'");
  });

  it("同じconfigからは常に同じコマンド列を生成する(純粋関数)", () => {
    const planA = buildFetchCommandPlan(config, localRawDbPath, localRawWalPath);
    const planB = buildFetchCommandPlan(config, localRawDbPath, localRawWalPath);
    expect(planA).toEqual(planB);
  });
});
