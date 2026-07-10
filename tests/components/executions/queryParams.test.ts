import {
  parseExecutionsSearchParams,
  buildExecutionsHref,
  type ExecutionsFilterState,
  type RawSearchParams,
} from "../../../src/components/executions/queryParams";

/**
 * src/components/executions/queryParams.ts の単体テスト。
 * searchParams⇔フィルタ状態の相互変換（画面4: frontend-design.md 画面4 / app-architecture.md §4, §6）
 */
describe("components/executions/queryParams", () => {
  describe("parseExecutionsSearchParams", () => {
    it("全パラメータが指定されている場合、そのまま反映する", () => {
      const sp: RawSearchParams = {
        status: "error",
        mode: "manual",
        workflowId: "wf-1",
        since: "2026-07-01",
        until: "2026-07-31",
        page: "3",
      };

      expect(parseExecutionsSearchParams(sp)).toEqual({
        status: "error",
        mode: "manual",
        workflowId: "wf-1",
        since: "2026-07-01",
        until: "2026-07-31",
        page: 3,
      });
    });

    it("空のsearchParamsの場合、全項目がundefinedでpageは1になる", () => {
      const result = parseExecutionsSearchParams({});

      expect(result).toEqual({
        status: undefined,
        mode: undefined,
        workflowId: undefined,
        since: undefined,
        until: undefined,
        page: 1,
      });
    });

    it("値が配列の場合は先頭要素を採用する", () => {
      const sp: RawSearchParams = {
        status: ["error", "success"],
        page: ["2", "5"],
      };

      const result = parseExecutionsSearchParams(sp);
      expect(result.status).toBe("error");
      expect(result.page).toBe(2);
    });

    it("値が空文字の場合はundefinedとして扱う", () => {
      const sp: RawSearchParams = { status: "", mode: "" };

      const result = parseExecutionsSearchParams(sp);
      expect(result.status).toBeUndefined();
      expect(result.mode).toBeUndefined();
    });

    it("値が空配列の場合はundefinedとして扱う", () => {
      const sp: RawSearchParams = { status: [] };

      const result = parseExecutionsSearchParams(sp);
      expect(result.status).toBeUndefined();
    });

    describe("pageのパース（境界値）", () => {
      it("page未指定の場合は1になる", () => {
        expect(parseExecutionsSearchParams({}).page).toBe(1);
      });

      it("page=0の場合は1にフォールバックする", () => {
        expect(parseExecutionsSearchParams({ page: "0" }).page).toBe(1);
      });

      it("page=-1のような負値は1にフォールバックする", () => {
        expect(parseExecutionsSearchParams({ page: "-1" }).page).toBe(1);
      });

      it("page=abcのような非数値文字列は1にフォールバックする", () => {
        expect(parseExecutionsSearchParams({ page: "abc" }).page).toBe(1);
      });

      it("page=2.7のような小数は切り捨てられる", () => {
        expect(parseExecutionsSearchParams({ page: "2.7" }).page).toBe(2);
      });

      it("page=Infinityの場合は1にフォールバックする", () => {
        expect(parseExecutionsSearchParams({ page: "Infinity" }).page).toBe(1);
      });

      it("page=1の場合はそのまま1になる", () => {
        expect(parseExecutionsSearchParams({ page: "1" }).page).toBe(1);
      });
    });
  });

  describe("buildExecutionsHref", () => {
    const base: ExecutionsFilterState = {
      status: undefined,
      mode: undefined,
      workflowId: undefined,
      since: undefined,
      until: undefined,
      page: 1,
    };

    it("フィルタが何も無い状態ではクエリ文字列無しのbaseを返す", () => {
      expect(buildExecutionsHref("/executions", base, {})).toBe("/executions");
    });

    it("page=1の場合はpageパラメータを付与しない", () => {
      const href = buildExecutionsHref("/executions", base, {
        status: "error",
        page: 1,
      });
      expect(href).toBe("/executions?status=error");
    });

    it("page>1の場合はpageパラメータを付与する", () => {
      const href = buildExecutionsHref("/executions", base, { page: 2 });
      expect(href).toBe("/executions?page=2");
    });

    it("現在の状態にoverridesをマージしたクエリ文字列を組み立てる", () => {
      const current: ExecutionsFilterState = {
        status: "error",
        mode: "manual",
        workflowId: "wf-1",
        since: "2026-07-01",
        until: "2026-07-31",
        page: 3,
      };

      const href = buildExecutionsHref("/executions", current, { page: 4 });
      expect(href).toBe(
        "/executions?status=error&mode=manual&workflowId=wf-1&since=2026-07-01&until=2026-07-31&page=4",
      );
    });

    it("overridesでundefinedを指定すると該当パラメータが外れる", () => {
      const current: ExecutionsFilterState = {
        status: "error",
        mode: "manual",
        workflowId: undefined,
        since: undefined,
        until: undefined,
        page: 1,
      };

      const href = buildExecutionsHref("/executions", current, {
        status: undefined,
      });
      expect(href).toBe("/executions?mode=manual");
    });

    it("フィルタ変更時にpage:1を指定するとページがリセットされる", () => {
      const current: ExecutionsFilterState = {
        status: "success",
        mode: undefined,
        workflowId: undefined,
        since: undefined,
        until: undefined,
        page: 5,
      };

      const href = buildExecutionsHref("/executions", current, {
        mode: "manual",
        page: 1,
      });
      expect(href).toBe("/executions?status=success&mode=manual");
    });
  });
});
