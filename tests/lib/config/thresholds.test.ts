import fs from "fs";
import os from "os";
import path from "path";
import { loadThresholds, ThresholdsSchema } from "../../../src/lib/config/thresholds";

describe("lib/config/thresholds", () => {
  const realConfigPath = path.join(process.cwd(), "config", "thresholds.json");

  it("実際のconfig/thresholds.jsonを正しく読み込み検証できる", () => {
    const thresholds = loadThresholds(realConfigPath);
    expect(ThresholdsSchema.safeParse(thresholds).success).toBe(true);
    expect(thresholds.memAvailableKb.warning).toBeGreaterThan(thresholds.memAvailableKb.danger);
    expect(thresholds.trendSampleMin).toBeGreaterThan(0);
  });

  describe("異常系", () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "thresholds-test-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("ファイルが存在しない場合はエラーを投げる", () => {
      const missingPath = path.join(tmpDir, "not-exist.json");
      expect(() => loadThresholds(missingPath)).toThrow();
    });

    it("不正なJSONの場合はエラーを投げる", () => {
      const invalidJsonPath = path.join(tmpDir, "invalid.json");
      fs.writeFileSync(invalidJsonPath, "{ not valid json ", "utf-8");
      expect(() => loadThresholds(invalidJsonPath)).toThrow();
    });

    it("スキーマに合致しない場合（数値であるべきところが文字列）はエラーを投げる", () => {
      const invalidSchemaPath = path.join(tmpDir, "invalid-schema.json");
      fs.writeFileSync(
        invalidSchemaPath,
        JSON.stringify({
          memAvailableKb: { warning: "153600", danger: 102400 },
          swapUsedKb: { warning: 1048576, danger: 1572864 },
          dbSizeBytes: { warning: 419430400 },
          trendSampleMin: 4,
        }),
        "utf-8",
      );
      expect(() => loadThresholds(invalidSchemaPath)).toThrow();
    });

    it("必須キー(trendSampleMin)が欠落している場合はエラーを投げる", () => {
      const missingKeyPath = path.join(tmpDir, "missing-key.json");
      fs.writeFileSync(
        missingKeyPath,
        JSON.stringify({
          memAvailableKb: { warning: 153600, danger: 102400 },
          swapUsedKb: { warning: 1048576, danger: 1572864 },
          dbSizeBytes: { warning: 419430400 },
        }),
        "utf-8",
      );
      expect(() => loadThresholds(missingKeyPath)).toThrow();
    });

    it("正の数でない値（0以下）はエラーを投げる", () => {
      const negativePath = path.join(tmpDir, "negative.json");
      fs.writeFileSync(
        negativePath,
        JSON.stringify({
          memAvailableKb: { warning: 153600, danger: -1 },
          swapUsedKb: { warning: 1048576, danger: 1572864 },
          dbSizeBytes: { warning: 419430400 },
          trendSampleMin: 4,
        }),
        "utf-8",
      );
      expect(() => loadThresholds(negativePath)).toThrow();
    });
  });
});
