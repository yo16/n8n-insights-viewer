import fs from "fs";
import path from "path";

/**
 * config/thresholds.json のスキーマ検証
 * (docs/design/api-design.md §5 設定（config/thresholds.json）)
 */
describe("config/thresholds.json", () => {
  const filePath = path.join(process.cwd(), "config", "thresholds.json");

  it("ファイルが存在し、有効なJSONとしてパースできる", () => {
    expect(fs.existsSync(filePath)).toBe(true);
    const raw = fs.readFileSync(filePath, "utf-8");
    expect(() => JSON.parse(raw)).not.toThrow();
  });

  const raw = fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : "{}";
  const thresholds = JSON.parse(raw);

  it("memAvailableKb.warning / memAvailableKb.danger が数値で定義されている", () => {
    expect(typeof thresholds.memAvailableKb?.warning).toBe("number");
    expect(typeof thresholds.memAvailableKb?.danger).toBe("number");
  });

  it("memAvailableKb は warning > danger である（空きメモリが少ないほど危険）", () => {
    expect(thresholds.memAvailableKb.warning).toBeGreaterThan(
      thresholds.memAvailableKb.danger,
    );
  });

  it("swapUsedKb.warning / swapUsedKb.danger が数値で定義されている", () => {
    expect(typeof thresholds.swapUsedKb?.warning).toBe("number");
    expect(typeof thresholds.swapUsedKb?.danger).toBe("number");
  });

  it("swapUsedKb は warning < danger である（swap使用量が多いほど危険）", () => {
    expect(thresholds.swapUsedKb.warning).toBeLessThan(thresholds.swapUsedKb.danger);
  });

  it("dbSizeBytes.warning が数値で定義されている", () => {
    expect(typeof thresholds.dbSizeBytes?.warning).toBe("number");
  });

  it("trendSampleMin が正の整数で定義されている", () => {
    expect(typeof thresholds.trendSampleMin).toBe("number");
    expect(Number.isInteger(thresholds.trendSampleMin)).toBe(true);
    expect(thresholds.trendSampleMin).toBeGreaterThan(0);
  });

  it("すべての閾値が正の数値である", () => {
    expect(thresholds.memAvailableKb.warning).toBeGreaterThan(0);
    expect(thresholds.memAvailableKb.danger).toBeGreaterThan(0);
    expect(thresholds.swapUsedKb.warning).toBeGreaterThan(0);
    expect(thresholds.swapUsedKb.danger).toBeGreaterThan(0);
    expect(thresholds.dbSizeBytes.warning).toBeGreaterThan(0);
  });
});
