import { parseProgressLines } from "../../../src/lib/sync-process/parseProgressLines";

/**
 * src/lib/sync-process/parseProgressLines.ts の単体テスト。
 * stdoutチャンクからJSON Lines進捗イベントへのパース（バッファリング含む）を検証する。
 */
describe("parseProgressLines", () => {
  it("改行区切りの複数行を全てイベントとしてパースする", () => {
    const chunk =
      '{"phase":"fetch","status":"start"}\n{"phase":"fetch","status":"done"}\n';

    const { events, remainder } = parseProgressLines("", chunk);

    expect(events).toEqual([
      { phase: "fetch", status: "start" },
      { phase: "fetch", status: "done" },
    ]);
    expect(remainder).toBe("");
  });

  it("改行で終わらない末尾行はremainderとして返す", () => {
    const chunk = '{"phase":"fetch","status":"start"}\n{"phase":"fetch","sta';

    const { events, remainder } = parseProgressLines("", chunk);

    expect(events).toEqual([{ phase: "fetch", status: "start" }]);
    expect(remainder).toBe('{"phase":"fetch","sta');
  });

  it("前回のremainderと今回のchunkを連結してパースする（チャンク境界をまたぐ行）", () => {
    const buffered = '{"phase":"fetch","stat';
    const chunk = 'us":"done"}\n';

    const { events, remainder } = parseProgressLines(buffered, chunk);

    expect(events).toEqual([{ phase: "fetch", status: "done" }]);
    expect(remainder).toBe("");
  });

  it("JSONとしてパースできない行は無視する", () => {
    const chunk = 'this is not json\n{"phase":"fetch","status":"start"}\n';

    const { events, remainder } = parseProgressLines("", chunk);

    expect(events).toEqual([{ phase: "fetch", status: "start" }]);
    expect(remainder).toBe("");
  });

  it("スキーマに合致しないJSON行は無視する", () => {
    const chunk =
      '{"phase":"unknown-phase","status":"start"}\n{"phase":"fetch","status":"start"}\n';

    const { events, remainder } = parseProgressLines("", chunk);

    expect(events).toEqual([{ phase: "fetch", status: "start" }]);
    expect(remainder).toBe("");
  });

  it("空行のみのchunkはイベント無しでremainderも空", () => {
    const { events, remainder } = parseProgressLines("", "\n\n");

    expect(events).toEqual([]);
    expect(remainder).toBe("");
  });

  it("__result__イベント（rowsIngested/error含む）を正しくパースする", () => {
    const chunk =
      '{"phase":"__result__","status":"success","rowsIngested":{"workflow_entity":3}}\n';

    const { events } = parseProgressLines("", chunk);

    expect(events).toEqual([
      {
        phase: "__result__",
        status: "success",
        rowsIngested: { workflow_entity: 3 },
      },
    ]);
  });
});
