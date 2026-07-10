import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright設定（雛形）。
 *
 * E2Eテスト本体は後続タスクで `tests/e2e/` 配下に追加する。
 * ブラウザバイナリのインストール（`npx playwright install`）は本タスクの対象外。
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
