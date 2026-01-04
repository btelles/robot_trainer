import { _electron as electron, ElectronApplication, Page } from "playwright";
import base from "@playwright/test";
import fs from 'fs';
import path from 'path';
import os from 'os';

export type Fixtures = {
  electronApp: ElectronApplication;
  window: Page;
  setIpcHandlers: (
    handlers: Record<string, (...args: any[]) => any>
  ) => Promise<void>;
};

export const test = base.extend<Fixtures>({
  electronApp: async ({ }, use) => {
    // Need separate tmp directories for each playwright test so that running multiple
    // playwright workers doesn't cause IndexedDB migration conflicts.
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'robot-trainer-test-'));
    const app = await electron.launch({
      args: [".vite/build/main.js", "--enable-logging", "--logging-level=0", `--user-data-dir=${tempDir}`],
    });
    await use(app);
    await app.close();
    try {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    } catch (e) {}
  },

  setIpcHandlers: async ({ electronApp }, use) => {
    await use(async (handlers: Record<string, (...args: any[]) => any>) => {
      const serialized: Record<string, string> = {};
      for (const [channel, fn] of Object.entries(handlers))
        serialized[channel] = fn.toString();
      await electronApp.evaluate(
        async ({ ipcMain, BrowserWindow, app }, handlerMap: Record<string, string>) => {
          // Expose electron modules to global scope so mocked handlers can use them
          Object.assign(globalThis, { ipcMain, BrowserWindow, app });

          for (const channel of Object.keys(handlerMap)) {
            try {
              ipcMain.removeHandler(channel);
            } catch (e) {}
            const fn = eval(`(${handlerMap[channel]})`);
            ipcMain.handle(channel, fn);
          }
        },
        serialized
      );
    });
  },

  window: async ({ electronApp }, use) => {
    // Wait for the application window (not DevTools)
    let win: Page | undefined = electronApp.windows().find((w) => !w.url().startsWith('devtools://'));
    if (!win) {
      win = await electronApp.waitForEvent('window', (w) => !w.url().startsWith('devtools://'));
    }
    await win.waitForLoadState("domcontentloaded");
    try {
      await win.setViewportSize({ width: 1200, height: 800 });
    } catch {}
    await use(win);
  },
});
