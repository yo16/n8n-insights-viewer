import fs from "fs";
import path from "path";

import { renderCollectorScript } from "../../../scripts/deploy-collector/renderTemplate";
import { parseCollectorJsonlLine } from "../../../scripts/sync/collectMetricsParsers";

const TEMPLATE_PATH = path.join(
  __dirname,
  "../../../scripts/deploy-collector/collector.sh.template",
);

describe("renderCollectorScript", () => {
  it("すべてのプレースホルダを実値に置換する", () => {
    const template = "V=__COLLECTOR_VERSION__ DB=__DB_PATH__ OUT=__OUTPUT_FILE__";
    const rendered = renderCollectorScript(template, {
      version: "collector-1",
      dbPath: "/root/n8n/.n8n/database.sqlite",
      outputFile: "/root/insights_collector/metrics.jsonl",
    });

    expect(rendered).toBe(
      "V=collector-1 DB=/root/n8n/.n8n/database.sqlite OUT=/root/insights_collector/metrics.jsonl",
    );
    expect(rendered).not.toContain("__COLLECTOR_VERSION__");
    expect(rendered).not.toContain("__DB_PATH__");
    expect(rendered).not.toContain("__OUTPUT_FILE__");
  });

  it("同じプレースホルダが複数回出現しても全て置換する", () => {
    const template = "__DB_PATH__ and __DB_PATH__-wal";
    const rendered = renderCollectorScript(template, {
      version: "v",
      dbPath: "/root/db.sqlite",
      outputFile: "/root/out.jsonl",
    });
    expect(rendered).toBe("/root/db.sqlite and /root/db.sqlite-wal");
  });

  it("置換後もプレースホルダ文字列が残ってしまう場合は例外を投げる", () => {
    // versionの置換値自体がプレースホルダ文字列と同一の場合、置換後の文字列に
    // プレースホルダが残存する（versionは最後に置換されるプレースホルダではないため
    // 後続ステップで再置換されない）。安全側に倒し、例外として検知する。
    const template = "__COLLECTOR_VERSION__";
    expect(() =>
      renderCollectorScript(template, {
        version: "__COLLECTOR_VERSION__",
        dbPath: "/root/db.sqlite",
        outputFile: "/root/out.jsonl",
      }),
    ).toThrow(/未置換のプレースホルダ/);
  });

  it("実際のcollector.sh.templateを読み込み、全プレースホルダが置換されること", () => {
    const template = fs.readFileSync(TEMPLATE_PATH, "utf8");
    const rendered = renderCollectorScript(template, {
      version: "collector-1",
      dbPath: "/root/n8n/.n8n/database.sqlite",
      outputFile: "/root/insights_collector/metrics.jsonl",
    });

    expect(rendered).not.toContain("__COLLECTOR_VERSION__");
    expect(rendered).not.toContain("__DB_PATH__");
    expect(rendered).not.toContain("__OUTPUT_FILE__");
    expect(rendered).toContain('V="collector-1"');
    expect(rendered).toContain('DB_PATH="/root/n8n/.n8n/database.sqlite"');
    expect(rendered).toContain(
      'OUT_FILE="/root/insights_collector/metrics.jsonl"',
    );
  });
});

describe("collector.sh.template 出力形式の互換性（parseCollectorJsonlLineとの整合）", () => {
  it("collector.shが出力する想定の1行がparseCollectorJsonlLineで正しくパースできる", () => {
    // scripts/deploy-collector/collector.sh.template のJSON組み立てロジック
    // （awk/printf）を手元のGit Bash環境で実際に実行し、得られた出力の実例。
    // シェルをテスト内で起動できないため、実際に検証済みの出力文字列を
    // 固定サンプルとして用い、parseCollectorJsonlLineとの形式整合を確認する。
    const line =
      '{"v":"collector-1","ts":"2026-07-10T10:35:40Z","mem":{"total_kb":977000,"available_kb":142000,"free_kb":38000},"swap":{"total_kb":2097148,"free_kb":1600000},"load":[0.42,0.55,0.6],"db":{"sqlite_bytes":6,"wal_bytes":9},"rootfs_avail_bytes":127012233216,"containers":[{"name":"n8n","cpu_pct":3.2,"mem_bytes":220200960,"mem_limit_bytes":1024458752}]}';

    const parsed = parseCollectorJsonlLine(line);

    expect(parsed).not.toBeNull();
    expect(parsed?.v).toBe("collector-1");
    expect(parsed?.ts).toBe("2026-07-10T10:35:40Z");
    expect(parsed?.mem).toEqual({
      total_kb: 977000,
      available_kb: 142000,
      free_kb: 38000,
    });
    expect(parsed?.swap).toEqual({ total_kb: 2097148, free_kb: 1600000 });
    expect(parsed?.load).toEqual([0.42, 0.55, 0.6]);
    expect(parsed?.db).toEqual({ sqlite_bytes: 6, wal_bytes: 9 });
    expect(parsed?.rootfs_avail_bytes).toBe(127012233216);
    expect(parsed?.containers).toEqual([
      {
        name: "n8n",
        cpu_pct: 3.2,
        mem_bytes: 220200960,
        mem_limit_bytes: 1024458752,
      },
    ]);
  });

  it("コンテナが0件の出力（containers:[]）も正しくパースできる", () => {
    const line =
      '{"v":"collector-1","ts":"2026-07-10T10:35:40Z","mem":{"total_kb":977000,"available_kb":142000,"free_kb":38000},"swap":{"total_kb":2097148,"free_kb":1600000},"load":[0.42,0.55,0.6],"db":{"sqlite_bytes":6,"wal_bytes":9},"rootfs_avail_bytes":127012233216,"containers":[]}';

    const parsed = parseCollectorJsonlLine(line);
    expect(parsed).not.toBeNull();
    expect(parsed?.containers).toEqual([]);
  });
});

describe("collector.sh.template の内容検証（標準コマンドのみ・新規ソフト導入なし）", () => {
  const template = fs.readFileSync(TEMPLATE_PATH, "utf8");

  it("失敗しても静かに終了する（終了コード0固定）ことが読み取れる", () => {
    expect(template).toContain("exit 0");
    expect(template).toMatch(/\|\|\s*true/);
  });

  it("標準コマンド（cat/awk/date/stat/df/docker）以外の新規ソフト導入を含まない", () => {
    const forbiddenPatterns = [
      /\bapt(-get)?\s+install\b/,
      /\bcurl\b/,
      /\bwget\b/,
      /\bpip\d?\s+install\b/,
      /\bnpm\s+install\b/,
      /\bsystemctl\s+enable\b/,
      /\bsudo\b/,
    ];
    for (const pattern of forbiddenPatterns) {
      expect(template).not.toMatch(pattern);
    }
  });

  it("バージョン識別子プレースホルダを含む", () => {
    expect(template).toContain("__COLLECTOR_VERSION__");
  });
});
