import {
  CRON_MINUTE,
  getDefaultDeployCollectorConfig,
} from "../../../scripts/deploy-collector/deployConfig";
import { getDefaultCollectMetricsConfig } from "../../../scripts/sync/config";

describe("getDefaultDeployCollectorConfig", () => {
  it("cronの分は00を避けている（ワークフローのスケジュール実行と重ねないため）", () => {
    expect(CRON_MINUTE).not.toBe(0);
    const config = getDefaultDeployCollectorConfig();
    expect(config.cronMinute).not.toBe(0);
    expect(config.cronLine.startsWith(`${config.cronMinute} * * * * `)).toBe(
      true,
    );
  });

  it("remoteScriptPath/remoteOutputPathは同一の専用ディレクトリ配下に置かれる", () => {
    const config = getDefaultDeployCollectorConfig();
    expect(config.remoteScriptPath.startsWith(`${config.remoteDir}/`)).toBe(
      true,
    );
    expect(config.remoteOutputPath.startsWith(`${config.remoteDir}/`)).toBe(
      true,
    );
    expect(config.remoteScriptPath).toBe(`${config.remoteDir}/collector.sh`);
  });

  it("同期CLI側（scripts/sync/config.ts）が想定するcollectorバージョン・出力パスと一致する（二重管理を避ける）", () => {
    const collectMetricsConfig = getDefaultCollectMetricsConfig();
    const config = getDefaultDeployCollectorConfig();
    expect(config.collectorVersion).toBe(
      collectMetricsConfig.expectedCollectorVersion,
    );
    expect(config.remoteOutputPath).toBe(
      collectMetricsConfig.remoteCollectorFilePath,
    );
  });

  it("cronLineは配置先のcollector.shを指す", () => {
    const config = getDefaultDeployCollectorConfig();
    expect(config.cronLine).toContain(config.remoteScriptPath);
  });
});
