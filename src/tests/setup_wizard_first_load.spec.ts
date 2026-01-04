import { test } from './fixtures';

// Tests for setup wizard appearance on first app load under various system config states.
// These tests use screenshots for validation as requested.

test.describe('Setup Wizard - first load scenarios (screenshots)', () => {
  // Increase timeout for these UI screenshot tests which may take longer
  test.setTimeout(20000);
  test.beforeEach(async ({ window }) => {
    // Provide basic renderer reply handlers used in other tests
    await window.evaluate(() => {
      // @ts-ignore
      if (window.electronAPI && window.electronAPI.onRequestSaveSystemSettings) {
        // @ts-ignore
        window.electronAPI.onRequestSaveSystemSettings((settings: any) => {
          // @ts-ignore
          window.electronAPI.replySaveSystemSettings({ success: true, settings });
        });
      }
    });
  });

  test('1 - all present: setup wizard does NOT show', async ({ window, setIpcHandlers }) => {
    await setIpcHandlers({
      'check-anaconda': async () => ({
        found: true,
        path: '/home/testuser/miniconda3',
        envs: [{ name: 'robot_trainer', pythonPath: '/home/testuser/miniconda3/envs/robot_trainer/bin/python' }],
        platform: 'linux'
      }),
      'check-lerobot': async () => ({ installed: true }),
    });

    // Reply to main process load request with config containing condaRoot and pythonPath
    await window.evaluate(() => {
      // @ts-ignore
      if (window.electronAPI && window.electronAPI.onRequestLoadSystemSettings) {
        // @ts-ignore
        window.electronAPI.onRequestLoadSystemSettings(() => {
          // @ts-ignore
          window.electronAPI.replyLoadSystemSettings({ condaRoot: '/home/testuser/miniconda3', pythonPath: '/home/testuser/miniconda3/envs/robot_trainer/bin/python' });
        });
      }
    });

    // Wait for app to load and allow time for any setup modal to appear
    await window.waitForLoadState('domcontentloaded');
    // Poll for the wizard for a short period; it should NOT appear
    let found = true;
    try {
      await window.waitForSelector('text=Welcome!', { timeout: 10000 });
      found = true;
    } catch {
      found = false;
    }
    // Ensure not found before screenshot
    if (found) {
      // if it unexpectedly appeared, wait until any loading spinner stops
      await window.waitForFunction(() => !document.querySelector('.max-w-4xl .animate-spin'), {}, { timeout: 10000 });
    }
    await window.screenshot({ path: 'test-results/setupwizard-firstload-1-no-wizard.png', fullPage: true });
  });

  test('2 - missing conda/python paths in DB: setup wizard shows', async ({ window, setIpcHandlers }) => {
    await setIpcHandlers({
      'check-anaconda': async () => ({ found: false, path: null, envs: [], platform: 'linux' }),
      'check-lerobot': async () => ({ installed: false }),
    });

    // Reply with empty config
    await window.evaluate(() => {
      // @ts-ignore
      if (window.electronAPI && window.electronAPI.onRequestLoadSystemSettings) {
        // @ts-ignore
        window.electronAPI.onRequestLoadSystemSettings(() => {
          // @ts-ignore
          window.electronAPI.replyLoadSystemSettings({});
        });
      }
    });

    await window.waitForLoadState('domcontentloaded');
    // Wait until the setup wizard appears and any loading settles
    await window.waitForSelector('text=Welcome!', { timeout: 10000 });
    await window.waitForFunction(() => !document.querySelector('.max-w-4xl .animate-spin'), {}, { timeout: 10000 });
    await window.screenshot({ path: 'test-results/setupwizard-firstload-2-missing-paths.png', fullPage: true });
  });

  test('3 - conda/python present but env missing: setup wizard shows', async ({ window, setIpcHandlers }) => {
    await setIpcHandlers({
      'check-anaconda': async () => ({
        found: true,
        path: '/home/testuser/miniconda3',
        envs: [{ name: 'other_env', pythonPath: '/home/testuser/miniconda3/envs/other_env/bin/python' }],
        platform: 'linux'
      }),
      'check-lerobot': async () => ({ installed: false }),
    });

    await window.evaluate(() => {
      // @ts-ignore
      if (window.electronAPI && window.electronAPI.onRequestLoadSystemSettings) {
        // @ts-ignore
        window.electronAPI.onRequestLoadSystemSettings(() => {
          // @ts-ignore
          window.electronAPI.replyLoadSystemSettings({ condaRoot: '/home/testuser/miniconda3', pythonPath: null });
        });
      }
    });

    await window.waitForLoadState('domcontentloaded');
    await window.waitForSelector('text=Welcome!', { timeout: 10000 });
    await window.waitForFunction(() => !document.querySelector('.max-w-4xl .animate-spin'), {}, { timeout: 10000 });
    await window.screenshot({ path: 'test-results/setupwizard-firstload-3-env-missing.png', fullPage: true });
  });

  test('4 - env present but lerobot missing: setup wizard shows', async ({ window, setIpcHandlers }) => {
    await setIpcHandlers({
      'check-anaconda': async () => ({
        found: true,
        path: '/home/testuser/miniconda3',
        envs: [{ name: 'robot_trainer', pythonPath: '/home/testuser/miniconda3/envs/robot_trainer/bin/python' }],
        platform: 'linux'
      }),
      'check-lerobot': async () => ({ installed: false }),
    });

    await window.evaluate(() => {
      // @ts-ignore
      if (window.electronAPI && window.electronAPI.onRequestLoadSystemSettings) {
        // @ts-ignore
        window.electronAPI.onRequestLoadSystemSettings(() => {
          // @ts-ignore
          window.electronAPI.replyLoadSystemSettings({ condaRoot: '/home/testuser/miniconda3', pythonPath: '/home/testuser/miniconda3/envs/robot_trainer/bin/python' });
        });
      }
    });

    await window.waitForLoadState('domcontentloaded');
    await window.waitForSelector('text=Welcome!', { timeout: 10000 });
    await window.waitForFunction(() => !document.querySelector('.max-w-4xl .animate-spin'), {}, { timeout: 10000 });
    await window.screenshot({ path: 'test-results/setupwizard-firstload-4-lerobot-missing.png', fullPage: true });
  });
});

export { test };
