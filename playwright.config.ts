import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./playwright/tests",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: "http://127.0.0.1:5000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev:client",
    url: "http://127.0.0.1:5000",
    reuseExistingServer: !process.env.CI,
    stdout: "pipe",
    stderr: "pipe",
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
  ],
});
