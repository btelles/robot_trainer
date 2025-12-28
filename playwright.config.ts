import { defineConfig } from '@playwright/test';

export default defineConfig({
  // Look for test files in the "tests" directory, relative to this configuration file.
  testDir: "src/tests",
  workers: process.env.CI ? 2 : undefined,
  fullyParallel: true,
  testMatch: "src/tests/*.spec.ts",
  timeout: 5000,
  use: {
    video: "on",
  },
});