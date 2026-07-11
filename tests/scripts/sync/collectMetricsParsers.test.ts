import {
  parseCollectorJsonl,
  parseCollectorJsonlLine,
  parseCpuMetricsRestPage,
  parseDockerStats,
  parseLoadavg,
  parseMeminfo,
  parseOomLogOutput,
  parseSpotOutput,
} from "../../../scripts/sync/collectMetricsParsers";

/**
 * collectMetricsParsers.ts の単体テスト。
 *
 * docs/design/data-sync-design.md §5 Phase 5 / §3.2 出力形式 準拠の
 * 現実的なサンプル文字列を使い、正常系・壊れた行の許容/スキップを検証する。
 */
describe("parseMeminfo", () => {
  it("/proc/meminfo の現実的な出力をパースする", () => {
    const text = `
MemTotal:         977000 kB
MemFree:           38000 kB
MemAvailable:     142000 kB
Buffers:            5000 kB
Cached:            80000 kB
SwapCached:            0 kB
SwapTotal:       2097148 kB
SwapFree:        1600000 kB
`;
    expect(parseMeminfo(text)).toEqual({
      memTotalKb: 977000,
      memAvailableKb: 142000,
      memFreeKb: 38000,
      swapTotalKb: 2097148,
      swapFreeKb: 1600000,
    });
  });

  it("壊れた/空の入力では全項目をnullにする", () => {
    expect(parseMeminfo("")).toEqual({
      memTotalKb: null,
      memAvailableKb: null,
      memFreeKb: null,
      swapTotalKb: null,
      swapFreeKb: null,
    });
    expect(parseMeminfo("garbage line without colon\nMemTotal: not-a-number kB")).toEqual({
      memTotalKb: null,
      memAvailableKb: null,
      memFreeKb: null,
      swapTotalKb: null,
      swapFreeKb: null,
    });
  });
});

describe("parseLoadavg", () => {
  it("/proc/loadavg の現実的な出力をパースする", () => {
    expect(parseLoadavg("0.42 0.55 0.60 1/234 5678")).toEqual({
      loadavg1: 0.42,
      loadavg5: 0.55,
      loadavg15: 0.6,
    });
  });

  it("壊れた入力ではnullにする", () => {
    expect(parseLoadavg("")).toEqual({
      loadavg1: null,
      loadavg5: null,
      loadavg15: null,
    });
    expect(parseLoadavg("not-a-number")).toEqual({
      loadavg1: null,
      loadavg5: null,
      loadavg15: null,
    });
  });
});

describe("parseDockerStats", () => {
  it("docker stats --no-stream の現実的な出力(複数コンテナ)をパースする", () => {
    const text = [
      "n8n\t3.20%\t210MiB / 954MiB",
      "traefik\t0.10%\t25MiB / 954MiB",
    ].join("\n");

    expect(parseDockerStats(text)).toEqual([
      {
        name: "n8n",
        cpuPct: 3.2,
        memUsageBytes: 210 * 1024 * 1024,
        memLimitBytes: 954 * 1024 * 1024,
      },
      {
        name: "traefik",
        cpuPct: 0.1,
        memUsageBytes: 25 * 1024 * 1024,
        memLimitBytes: 954 * 1024 * 1024,
      },
    ]);
  });

  it("タブ区切りでない壊れた行はスキップする", () => {
    const text = ["n8n\t3.20%\t210MiB / 954MiB", "malformed line without tabs"].join(
      "\n",
    );
    const rows = parseDockerStats(text);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("n8n");
  });

  it("空文字列は空配列を返す", () => {
    expect(parseDockerStats("")).toEqual([]);
  });
});

describe("parseSpotOutput", () => {
  it("マーカー区切りの1コマンド分の出力をまとめてパースする", () => {
    const stdout = [
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
      "traefik\t0.10%\t25MiB / 954MiB",
      "===DBSIZE===",
      "322961408",
      "24117248",
      "===ROOTFS===",
      "8123456789",
      "",
    ].join("\n");

    const result = parseSpotOutput(stdout);

    expect(result.meminfo.memTotalKb).toBe(977000);
    expect(result.meminfo.memAvailableKb).toBe(142000);
    expect(result.loadavg).toEqual({ loadavg1: 0.42, loadavg5: 0.55, loadavg15: 0.6 });
    expect(result.containers).toHaveLength(2);
    expect(result.containers[0].name).toBe("n8n");
    expect(result.dbSizeBytes).toBe(322961408);
    expect(result.walSizeBytes).toBe(24117248);
    expect(result.rootfsAvailBytes).toBe(8123456789);
  });

  it("セクションが欠けていても例外を投げず、欠けた項目はnull/空配列にする", () => {
    const stdout = "===MEMINFO===\nMemTotal: 977000 kB\n";
    const result = parseSpotOutput(stdout);
    expect(result.meminfo.memTotalKb).toBe(977000);
    expect(result.loadavg).toEqual({
      loadavg1: null,
      loadavg5: null,
      loadavg15: null,
    });
    expect(result.containers).toEqual([]);
    expect(result.dbSizeBytes).toBeNull();
    expect(result.walSizeBytes).toBeNull();
    expect(result.rootfsAvailBytes).toBeNull();
  });

  it("完全に空の出力でも例外を投げない", () => {
    expect(() => parseSpotOutput("")).not.toThrow();
  });
});

describe("parseOomLogOutput", () => {
  it("journalctl -o short-iso 形式のOOM記録行をパースする", () => {
    const line =
      "journalctl|2026-07-05T03:12:45+0000 n8n-host kernel: Out of memory: Killed process 1234 (node) total-vm:2048000kB, anon-rss:900000kB";
    const events = parseOomLogOutput(line);
    expect(events).toHaveLength(1);
    expect(events[0].occurredAtUtc).toBe(new Date("2026-07-05T03:12:45+0000").toISOString());
    expect(events[0].killedProcess).toBe("node");
    expect(events[0].source).toBe("journalctl");
  });

  it("kern.logフォールバック(kernlog|接頭辞)の行もパースする", () => {
    const line =
      "kernlog|Jul  5 03:12:45 2026 n8n-host kernel: Out of memory: Killed process 5678 (n8n) total-vm:...";
    // kern.log標準形式は年を含まないため、ここではISO形式で代用したテスト用行を使う
    const isoLine =
      "kernlog|2026-07-05T03:12:45.000Z n8n-host kernel: Out of memory: Killed process 5678 (n8n) total-vm:...";
    expect(parseOomLogOutput(line)).toEqual([]);
    const events = parseOomLogOutput(isoLine);
    expect(events).toHaveLength(1);
    expect(events[0].source).toBe("kern.log");
    expect(events[0].killedProcess).toBe("n8n");
  });

  it("接頭辞のない行・タイムスタンプ不明の行はスキップする", () => {
    const text = [
      "no-prefix-line: Killed process 1 (x)",
      "journalctl|not-a-timestamp kernel: Killed process 1 (x)",
      "",
    ].join("\n");
    expect(parseOomLogOutput(text)).toEqual([]);
  });

  it("killed processが特定できない行は killedProcess=null で返す", () => {
    const line =
      "journalctl|2026-07-05T03:12:45+0000 n8n-host kernel: invoked oom-killer: gfp_mask=...";
    const events = parseOomLogOutput(line);
    expect(events).toHaveLength(1);
    expect(events[0].killedProcess).toBeNull();
  });

  it("空文字列は空配列を返す", () => {
    expect(parseOomLogOutput("")).toEqual([]);
  });
});

describe("parseCollectorJsonlLine / parseCollectorJsonl", () => {
  const sampleLine =
    '{"v":"collector-1","ts":"2026-07-10T05:17:03Z","mem":{"total_kb":977000,"available_kb":142000,"free_kb":38000},"swap":{"total_kb":2097148,"free_kb":1600000},"load":[0.42,0.55,0.60],"db":{"sqlite_bytes":322961408,"wal_bytes":24117248},"rootfs_avail_bytes":8123456789,"containers":[{"name":"n8n","cpu_pct":3.2,"mem_bytes":210000000,"mem_limit_bytes":0},{"name":"traefik","cpu_pct":0.1,"mem_bytes":25000000,"mem_limit_bytes":0}]}';

  it("設計書記載の現実的な1行をパースする", () => {
    const sample = parseCollectorJsonlLine(sampleLine);
    expect(sample).not.toBeNull();
    expect(sample?.v).toBe("collector-1");
    expect(sample?.ts).toBe("2026-07-10T05:17:03Z");
    expect(sample?.containers).toHaveLength(2);
  });

  it("不正なJSON・スキーマ不一致の行はnullを返す", () => {
    expect(parseCollectorJsonlLine("not json at all")).toBeNull();
    expect(parseCollectorJsonlLine('{"v":"collector-1"}')).toBeNull();
    expect(parseCollectorJsonlLine("")).toBeNull();
  });

  it("複数行のJSONLをパースし、壊れた行はスキップしつつ正常な行だけ取り込む", () => {
    const text = [sampleLine, "broken line", sampleLine, ""].join("\n");
    const { samples, skippedLines } = parseCollectorJsonl(text);
    expect(samples).toHaveLength(2);
    expect(skippedLines).toBe(1);
  });
});

describe("parseCpuMetricsRestPage", () => {
  it("Cloud Monitoring REST API(timeSeries.list)の現実的なレスポンスをパースする", () => {
    const json = JSON.stringify({
      timeSeries: [
        {
          metric: { type: "compute.googleapis.com/instance/cpu/utilization" },
          resource: {
            type: "gce_instance",
            labels: { zone: "us-central1-c" },
          },
          points: [
            {
              interval: {
                startTime: "2026-07-10T04:00:00Z",
                endTime: "2026-07-10T04:00:00Z",
              },
              value: { doubleValue: 0.032 },
            },
            {
              interval: {
                startTime: "2026-07-10T05:00:00Z",
                endTime: "2026-07-10T05:00:00Z",
              },
              value: { doubleValue: 0.045 },
            },
          ],
        },
      ],
    });

    const result = parseCpuMetricsRestPage(json);
    expect(result.points).toEqual([
      { tsUtc: "2026-07-10T04:00:00.000Z", cpuUtil: 0.032 },
      { tsUtc: "2026-07-10T05:00:00.000Z", cpuUtil: 0.045 },
    ]);
    expect(result.nextPageToken).toBeUndefined();
  });

  it("nextPageTokenを含むレスポンスから次ページトークンを取り出す", () => {
    const json = JSON.stringify({
      timeSeries: [
        {
          points: [
            {
              interval: { endTime: "2026-07-10T04:00:00Z" },
              value: { doubleValue: 0.01 },
            },
          ],
        },
      ],
      nextPageToken: "abc123",
    });

    const result = parseCpuMetricsRestPage(json);
    expect(result.points).toHaveLength(1);
    expect(result.nextPageToken).toBe("abc123");
  });

  it("空・不正なJSON・想定外の構造は空配列にする(例外を投げない)", () => {
    expect(parseCpuMetricsRestPage("")).toEqual({ points: [] });
    expect(parseCpuMetricsRestPage("not json")).toEqual({ points: [] });
    expect(parseCpuMetricsRestPage("{}")).toEqual({
      points: [],
      nextPageToken: undefined,
    });
    expect(parseCpuMetricsRestPage(JSON.stringify({ timeSeries: [{}] }))).toEqual({
      points: [],
      nextPageToken: undefined,
    });
    expect(
      parseCpuMetricsRestPage(
        JSON.stringify({ timeSeries: [{ points: [{ interval: {}, value: {} }] }] }),
      ),
    ).toEqual({ points: [], nextPageToken: undefined });
  });

  it("同一tsの重複エントリは後勝ちで1件に統合される", () => {
    const json = JSON.stringify({
      timeSeries: [
        {
          points: [
            {
              interval: { endTime: "2026-07-10T04:00:00Z" },
              value: { doubleValue: 0.01 },
            },
          ],
        },
        {
          points: [
            {
              interval: { endTime: "2026-07-10T04:00:00Z" },
              value: { doubleValue: 0.02 },
            },
          ],
        },
      ],
    });
    expect(parseCpuMetricsRestPage(json).points).toEqual([
      { tsUtc: "2026-07-10T04:00:00.000Z", cpuUtil: 0.02 },
    ]);
  });
});
