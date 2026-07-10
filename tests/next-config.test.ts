import fs from "fs";
import path from "path";

/**
 * next.config.ts の必須設定検証
 * (docs/design/api-design.md §2.3 next.config.ts 必須設定)
 */
describe("next.config.ts", () => {
  const filePath = path.join(process.cwd(), "next.config.ts");
  const content = fs.readFileSync(filePath, "utf-8");

  it("ファイルが存在する", () => {
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it("serverExternalPackages に better-sqlite3 が含まれる", () => {
    expect(content).toMatch(
      /serverExternalPackages\s*:\s*\[[^\]]*["']better-sqlite3["'][^\]]*\]/,
    );
  });

  it("output: \"export\" が設定されていない（DBを読めなくなるため禁止）", () => {
    // コメント行を除去してから検証する（コメント内の言及と誤検出しないため）
    const codeOnly = content
      .split("\n")
      .filter((line) => !line.trim().startsWith("//"))
      .join("\n");
    expect(codeOnly).not.toMatch(/output\s*:\s*["']export["']/);
  });

  it("NextConfig 型のオブジェクトを default export している", async () => {
    const configModule = await import("../next.config");
    const nextConfig = configModule.default;
    expect(nextConfig).toBeDefined();
    expect(nextConfig.serverExternalPackages).toContain("better-sqlite3");
  });
});
