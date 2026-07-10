import fs from "fs";
import path from "path";

/**
 * package.json の必須npmスクリプト定義の検証
 * (tz8: Next.jsプロジェクト雛形の作成)
 */
describe("package.json のscripts", () => {
  const filePath = path.join(process.cwd(), "package.json");
  const pkg = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  it.each([
    "dev",
    "build",
    "start",
    "lint",
    "test",
    "test:e2e",
    "sync",
    "deploy-collector",
  ])("scripts.%s が定義されている", (scriptName) => {
    expect(pkg.scripts).toHaveProperty(scriptName);
    expect(typeof pkg.scripts[scriptName]).toBe("string");
    expect(pkg.scripts[scriptName].length).toBeGreaterThan(0);
  });

  it("dev/build/start は next コマンドを使用する", () => {
    expect(pkg.scripts.dev).toContain("next dev");
    expect(pkg.scripts.build).toContain("next build");
    expect(pkg.scripts.start).toContain("next start");
  });

  it("test は jest を使用する", () => {
    expect(pkg.scripts.test).toContain("jest");
  });

  it("test:e2e は playwright を使用する", () => {
    expect(pkg.scripts["test:e2e"]).toContain("playwright");
  });
});
