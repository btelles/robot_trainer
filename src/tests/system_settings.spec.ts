import { _electron as electron, ElectronApplication, Page } from 'playwright';
import base, { expect } from '@playwright/test';

type Fixtures = {
  electronApp: ElectronApplication;
  window: Page;
  setIpcHandlers: (handlers: Record<string, (...args: any[]) => any>) => Promise<void>;
};

const test = base.extend<Fixtures>({
  electronApp: async ({ }, use) => {
    const app = await electron.launch({ args: ['.vite/build/main.js', '--enable-logging', '--logging-level=0'] });
    await use(app);
    await app.close();
  },

  setIpcHandlers: async ({ electronApp }, use) => {
    await use(async (handlers: Record<string, (...args: any[]) => any>) => {
      const serialized: Record<string, string> = {};
      for (const [channel, fn] of Object.entries(handlers)) serialized[channel] = fn.toString();
      await electronApp.evaluate(async ({ ipcMain }, handlerMap: Record<string, string>) => {
        for (const channel of Object.keys(handlerMap)) {
          try { ipcMain.removeHandler(channel); } catch (e) { }
          const fn = eval(`(${handlerMap[channel]})`);
          ipcMain.handle(channel, fn);
        }
      }, serialized);
    });
  },

  window: async ({ electronApp }, use) => {
    const win = await electronApp.firstWindow();
    await win.waitForLoadState('domcontentloaded');
    try { await win.setViewportSize({ width: 1200, height: 800 }); } catch { }
    await use(win);
  }
});

test.describe('System Settings integration with ConfigManager IPC', () => {
  test('saves settings successfully', async ({ window, setIpcHandlers, electronApp }) => {
    await setIpcHandlers({
      'load-system-settings': async () => ({ pythonPath: '', venvPath: '', extraPath: '', envVars: [] }),
      'save-system-settings': async (_event: any, settings: any) => ({ ok: true }),
    });

    await window.click('text=System Settings');
    await window.fill('label:has-text("Python Interpreter Path") + div input', '/usr/bin/python3');
    await window.click('text=Save Settings');
    await window.waitForSelector('text=Settings saved');
  });

  test('shows error when save fails', async ({ window, setIpcHandlers }) => {
    await setIpcHandlers({
      'load-system-settings': async () => ({}),
      'save-system-settings': async () => { throw new Error('disk full'); },
    });

    await window.click('text=System Settings');
    await window.fill('label:has-text("Python Interpreter Path") + div input', '/usr/bin/python3');
    await window.click('text=Save Settings');
    await window.waitForSelector('text=Failed to save settings', { timeout: 5000 });
  });

  test('handles malformed settings on load gracefully', async ({ window, setIpcHandlers }) => {
    await setIpcHandlers({
      'load-system-settings': async () => { throw new Error('malformed'); },
    });

    await window.click('text=System Settings');
    // fields should retain defaults (empty)
    const pyVal = await window.inputValue('label:has-text("Python Interpreter Path") + div input');
    expect(pyVal).toBe('');
  });

  test.only('reacts to external settings change event', async ({ window, setIpcHandlers, electronApp }) => {
    await setIpcHandlers({
      'load-system-settings': async () => ({ pythonPath: '/initial', venvPath: '', extraPath: '', envVars: [] }),
      'save-system-settings': async () => ({ ok: true }),
    });

    await window.click('text=System Settings');
    await window.waitForSelector('input[value="/initial"]');

    // simulate main process broadcasting an external change
    // Note: `require` is not available inside the evaluate context; Playwright provides
    // main-process modules as properties on the first argument. Destructure `BrowserWindow`.
    await electronApp.evaluate(async ({ BrowserWindow }, data) => {
      const wins = BrowserWindow.getAllWindows();
      if (wins && wins[0]) wins[0].webContents.send('system-settings-changed', data);
    }, { pythonPath: '/changed', venvPath: '', extraPath: '', envVars: [] });

    await window.waitForSelector('input[value="/changed"]');
  });
});
