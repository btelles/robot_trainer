import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
        environment: 'jsdom',
        exclude: [
          "**/src/python/**",
          "**/src/tests/**",
          "**/node_modules/**",
          "**/src/lib/config_manager.test.ts"
        ],
        include: [
            "**/src/**/*.test.ts",
            "**/src/**/*.test.tsx"
          ]
  },
});
