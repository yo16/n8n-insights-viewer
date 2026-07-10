import fs from "fs";
import os from "os";
import path from "path";

import Database from "better-sqlite3";

import { runCollectMetricsPhase } from "../../../scripts/sync/phases/collectMetricsPhase";
import { initializeDatabase } from "../../../src/shared/db/init";
import { FakeCommandRunner } from "./fakes/fakeCommandRunner";
import type { GcloudSyncConfig, CollectMetricsConfig } from "../../../scripts/sync/config";

/**
 * collectMetricsPhase.ts の結合テスト。
 *
 * 絶対厳守: FakeCommandRunnerのみを使用し、実gcloudコマンドは一切実行しない。
 *
 * 検証観点:
 * - スポット収集・OOMログ・cronファイル・CPU使用率の4項目が正しくDBへUPSERTされること
 * - cronファイルが存在しない(scp失敗)場合はスキップ扱いになり、warningsに含まれないこと
 * - いずれかの項目が失敗しても、フェーズ自体は例外を投げず warnings に記録すること
 * - collectorのバージョン不一致がwarningsに記録されること
 */
describe("runCollectMetricsPhase", () => {
  let tmpDir: string;
  let db: Database.Database;
  let localCollectorTmpPath: string;
  const gcloudConfig: GcloudSyncConfig = {
    project: "test-project",
    zone: "test-zone",
    instance: "test-instance",
    remoteDbPath: "/root/n8n/.n8n/database.sqlite",
    remoteTmpDir: "/tmp/n8n_insights_sync",
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(
      path.join(os.tmpdir(), "n8n-insights-viewer-collect-metrics-test-"),
    );
    db = new Database(path.join(tmpDir, "test.sqlite"));
    initializeDatabase(db);
    localCollectorTmpPath = path.join(tmpDir, "metrics.jsonl");
  });

  afterEach(() => {
    db.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function makeCollectMetricsConfig(
    overrides: Partial<CollectMetricsConfig> = {},
  ): CollectMetricsConfig {
    return {
      remoteCollectorFilePath: "/root/insights_collector/metrics.jsonl",
      expectedCollectorVersion: "collector-1",
      localCollectorTmpPath,
      cpuMetricsLookbackDays: 42,
      ...overrides,
    };
  }

  const SPOT_STDOUT = [
    "===MEMINFO===",
    "MemTotal:         977000 kB",
    "MemAvailable:     142000 kB",
    "MemFree:           38000 kB",
    "SwapTotal:       2097148 kB",
    "SwapFree:        1600000 kB",
    "===LOADAVG===",
    "0.42 0.55 0.60 1/234 5678",
    "===DOCKERSTATS===",
    "n8n\t3.20%\t210MiB / 954MiB",
    "===DBSIZE===",
    "322961408",
    "24117248",
    "===ROOTFS===",
    "8123456789",
  ].join("\n");

  const OOM_STDOUT =
    "journalctl|2026-07-05T03:12:45+0000 host kernel: Out of memory: Killed process 1234 (node) total-vm:...";

  const COLLECTOR_JSONL_SAMPLE =
    '{"v":"collector-1","ts":"2026-07-10T05:17:03Z","mem":{"total_kb":977000,"available_kb":142000,"free_kb":38000},"swap":{"total_kb":2097148,"free_kb":1600000},"load":[0.42,0.55,0.60],"db":{"sqlite_bytes":322961408,"wal_bytes":24117248},"rootfs_avail_bytes":8123456789,"containers":[{"name":"n8n","cpu_pct":3.2,"mem_bytes":210000000,"mem_limit_bytes":0}]}';

  const CPU_JSON = JSON.stringify([
    {
      points: [
        {
          interval: { endTime: "2026-07-10T05:00:00Z" },
          value: { doubleValue: 0.045 },
        },
      ],
    },
  ]);

  it("4項目すべて成功: machine_metrics/container_stats/oom_events/cpu_metricsへUPSERTされる", async () => {
    const runner = new FakeCommandRunner([
      { stdout: SPOT_STDOUT, stderr: "", exitCode: 0 }, // spot
      { stdout: OOM_STDOUT, stderr: "", exitCode: 0 }, // oom
      () => {
        // scpの副作用としてローカルにcollectorファイルを書き出す
        fs.writeFileSync(localCollectorTmpPath, `${COLLECTOR_JSONL_SAMPLE}\n`);
        return { stdout: "", stderr: "", exitCode: 0 };
      }, // scp collector file
      { stdout: CPU_JSON, stderr: "", exitCode: 0 }, // cpu metrics
    ]);

    const result = await runCollectMetricsPhase(db, {
      runner,
      gcloudConfig,
      collectMetricsConfig: makeCollectMetricsConfig(),
    });

    expect(result.warnings).toEqual([]);
    expect(result.collectorVersionSeen).toBe("collector-1");

    const spotMetric = db
      .prepare("SELECT * FROM machine_metrics WHERE source = 'spot'")
      .get() as Record<string, unknown>;
    expect(spotMetric.mem_total_kb).toBe(977000);
    expect(spotMetric.mem_available_kb).toBe(142000);

    const cronMetric = db
      .prepare("SELECT * FROM machine_metrics WHERE source = 'cron'")
      .get() as Record<string, unknown>;
    expect(cronMetric.ts_utc).toBe("2026-07-10T05:17:03Z");
    expect(cronMetric.collector_version).toBe("collector-1");

    const containerRows = db.prepare("SELECT * FROM container_stats").all();
    expect(containerRows).toHaveLength(2); // spot 1件 + cron 1件

    const oomRows = db.prepare("SELECT * FROM oom_events").all() as Array<
      Record<string, unknown>
    >;
    expect(oomRows).toHaveLength(1);
    expect(oomRows[0].killed_process).toBe("node");

    const cpuRows = db.prepare("SELECT * FROM cpu_metrics").all() as Array<
      Record<string, unknown>
    >;
    expect(cpuRows).toHaveLength(1);
    expect(cpuRows[0].cpu_util).toBe(0.045);

    // 一時ファイルは取り込み後に削除される
    expect(fs.existsSync(localCollectorTmpPath)).toBe(false);
  });

  it("collectorファイルが存在しない(scp失敗)場合はスキップ扱いになり、warningsに含まれない", async () => {
    const runner = new FakeCommandRunner([
      { stdout: SPOT_STDOUT, stderr: "", exitCode: 0 }, // spot
      { stdout: "", stderr: "", exitCode: 0 }, // oom (no events)
      { stdout: "", stderr: "no such file", exitCode: 1 }, // scp collector file fails
      { stdout: "[]", stderr: "", exitCode: 0 }, // cpu metrics
    ]);

    const result = await runCollectMetricsPhase(db, {
      runner,
      gcloudConfig,
      collectMetricsConfig: makeCollectMetricsConfig(),
    });

    expect(result.warnings).toEqual([]);
    expect(result.collectorVersionSeen).toBeUndefined();

    const cronRows = db
      .prepare("SELECT * FROM machine_metrics WHERE source = 'cron'")
      .all();
    expect(cronRows).toHaveLength(0);
  });

  it("スポット収集コマンドが失敗しても例外を投げず、warningsに記録して他の項目は継続する", async () => {
    const runner = new FakeCommandRunner([
      { stdout: "", stderr: "ssh auth error", exitCode: 1 }, // spot fails
      { stdout: OOM_STDOUT, stderr: "", exitCode: 0 }, // oom ok
      { stdout: "", stderr: "no such file", exitCode: 1 }, // scp fails
      { stdout: CPU_JSON, stderr: "", exitCode: 0 }, // cpu ok
    ]);

    const result = await runCollectMetricsPhase(db, {
      runner,
      gcloudConfig,
      collectMetricsConfig: makeCollectMetricsConfig(),
    });

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/スポット収集に失敗/);

    const oomRows = db.prepare("SELECT * FROM oom_events").all();
    expect(oomRows).toHaveLength(1);
    const cpuRows = db.prepare("SELECT * FROM cpu_metrics").all();
    expect(cpuRows).toHaveLength(1);
  });

  it("collectorのバージョン不一致はwarningsに記録されるが取り込みは継続する", async () => {
    const mismatchedSample = COLLECTOR_JSONL_SAMPLE.replace(
      '"v":"collector-1"',
      '"v":"collector-2"',
    );
    const runner = new FakeCommandRunner([
      { stdout: SPOT_STDOUT, stderr: "", exitCode: 0 },
      { stdout: "", stderr: "", exitCode: 0 },
      () => {
        fs.writeFileSync(localCollectorTmpPath, `${mismatchedSample}\n`);
        return { stdout: "", stderr: "", exitCode: 0 };
      },
      { stdout: "[]", stderr: "", exitCode: 0 },
    ]);

    const result = await runCollectMetricsPhase(db, {
      runner,
      gcloudConfig,
      collectMetricsConfig: makeCollectMetricsConfig({
        expectedCollectorVersion: "collector-1",
      }),
    });

    expect(result.collectorVersionSeen).toBe("collector-2");
    expect(result.warnings.some((w) => w.includes("バージョン不一致"))).toBe(
      true,
    );

    const cronMetric = db
      .prepare("SELECT * FROM machine_metrics WHERE source = 'cron'")
      .get() as Record<string, unknown>;
    expect(cronMetric).toBeDefined();
  });

  it("2回目のフェーズ実行(同一ts_utcのcronサンプル)でも重複せずUPSERTされる", async () => {
    const runOnce = async () => {
      const runner = new FakeCommandRunner([
        { stdout: SPOT_STDOUT, stderr: "", exitCode: 0 },
        { stdout: "", stderr: "", exitCode: 0 },
        () => {
          fs.writeFileSync(
            localCollectorTmpPath,
            `${COLLECTOR_JSONL_SAMPLE}\n`,
          );
          return { stdout: "", stderr: "", exitCode: 0 };
        },
        { stdout: "[]", stderr: "", exitCode: 0 },
      ]);
      return runCollectMetricsPhase(db, {
        runner,
        gcloudConfig,
        collectMetricsConfig: makeCollectMetricsConfig(),
      });
    };

    await runOnce();
    await runOnce();

    const cronRows = db
      .prepare("SELECT * FROM machine_metrics WHERE source = 'cron'")
      .all();
    expect(cronRows).toHaveLength(1);
  });
});
