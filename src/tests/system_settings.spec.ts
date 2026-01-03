import { expect } from '@playwright/test';
import { test } from './fixtures';

test.describe('System Settings integration with ConfigManager IPC', () => {
  test('saves settings successfully', async ({ window, setIpcHandlers, electronApp }) => {
    await setIpcHandlers({});
    // Register renderer-side listener to respond to main's request
    await window.evaluate(() => {
      // @ts-ignore
      window.electronAPI.onRequestLoadSystemSettings(() => {
        // @ts-ignore
        window.electronAPI.replyLoadSystemSettings({ pythonPath: '', venvPath: '', extraPath: '', envVars: [] });
      });
      // @ts-ignore
      window.electronAPI.onRequestSaveSystemSettings((settings: any) => {
        // pretend save OK
        // @ts-ignore
        window.electronAPI.replySaveSystemSettings({ success: true, settings });
      });
    });

    await window.click('text=System Settings');
    await window.fill('label:has-text("Python Interpreter Path") + div input', '/usr/bin/python3');
    await window.click('text=Save Settings');
    await window.waitForSelector('text=Settings saved');
  });

  test('shows error when save fails', async ({ window, setIpcHandlers }) => {
    await setIpcHandlers({});
    await window.evaluate(() => {
      // @ts-ignore
      window.electronAPI.onRequestLoadSystemSettings(() => {
        // @ts-ignore
        window.electronAPI.replyLoadSystemSettings({});
      });
      // @ts-ignore
      window.electronAPI.onRequestSaveSystemSettings(() => {
        // simulate failure
        // @ts-ignore
        window.electronAPI.replySaveSystemSettings({ success: false, error: 'disk full' });
      });
    });

    await window.click('text=System Settings');
    await window.fill('label:has-text("Python Interpreter Path") + div input', '/usr/bin/python3');
    await window.click('text=Save Settings');
    await window.waitForSelector('text=Failed to save settings', { timeout: 5000 });
  });

  test('handles malformed settings on load gracefully', async ({ window, setIpcHandlers }) => {
    await setIpcHandlers({});
    await window.evaluate(() => {
      // @ts-ignore
      window.electronAPI.onRequestLoadSystemSettings(() => {
        // @ts-ignore
        window.electronAPI.replyLoadSystemSettings(null);
      });
    });

    await window.click('text=System Settings');
    // fields should retain defaults (empty)
    const pyVal = await window.inputValue('label:has-text("Python Interpreter Path") + div input');
    expect(pyVal).toBe('');
  });

  test('reacts to external settings change event', async ({ window, setIpcHandlers, electronApp }) => {
    await setIpcHandlers({});
    await window.evaluate(() => {
      // @ts-ignore
      window.electronAPI.onRequestLoadSystemSettings(() => {
        // @ts-ignore
        window.electronAPI.replyLoadSystemSettings({ pythonPath: '/initial', venvPath: '', extraPath: '', envVars: [] });
      });
      // @ts-ignore
      window.electronAPI.onRequestSaveSystemSettings((settings: any) => {
        // @ts-ignore
        window.electronAPI.replySaveSystemSettings({ success: true, settings });
      });
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
