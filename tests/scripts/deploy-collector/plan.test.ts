import {
  formatPlan,
  formatUninstallInstructions,
  type DeployPlan,
} from "../../../scripts/deploy-collector/plan";

const plan: DeployPlan = {
  remoteDir: "/root/insights_collector",
  remoteScriptPath: "/root/insights_collector/collector.sh",
  cronLine: "17 * * * * /root/insights_collector/collector.sh",
  renderedScript: "#!/bin/sh\necho hello\n",
  project: "automation-n8n-445800",
  zone: "us-central1-c",
  instance: "instance-20241225-025109-n8n",
};

describe("formatPlan", () => {
  it("配置先・crontab行・スクリプト全文を含む", () => {
    const text = formatPlan(plan);
    expect(text).toContain(plan.remoteScriptPath);
    expect(text).toContain(plan.cronLine);
    expect(text).toContain(plan.renderedScript);
    expect(text).toContain(plan.instance);
  });
});

describe("formatUninstallInstructions", () => {
  it("cron行の削除手順とディレクトリ削除手順を含む（設置先が/root配下・rootのcrontabのためsudo付き）", () => {
    const text = formatUninstallInstructions(plan);
    expect(text).toContain(plan.cronLine);
    expect(text).toContain("sudo crontab -e");
    expect(text).toContain(`sudo rm -rf ${plan.remoteDir}`);
    expect(text).toContain(plan.instance);
  });
});
