import { defineConfig } from '@playwright/test';

export default defineConfig({
  // Look for test files in the "tests" directory, relative to this configuration file.
  testDir: "src/tests",
  testMatch: "src/tests/*.spec.ts",
  use: {
    video: 'on'
  }
});