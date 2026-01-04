import { test } from './fixtures';
import { expect } from '@playwright/test';

// Validates that selecting the main menu File -> Setup Wizard opens the wizard
test('File -> Setup Wizard opens the SetupWizard modal', async ({ window, electronApp, setIpcHandlers }) => {
  await setIpcHandlers({
    'check-anaconda': async () => ({
      found: true,
      path: '/home/testuser/miniconda3',
      envs: [{ name: 'robot_trainer', pythonPath: '/home/testuser/miniconda3/envs/robot_trainer/bin/python' }],
      platform: 'linux'
    }),
    'check-lerobot': async () => ({ installed: true }),
  });

  // Ensure renderer replies with a config that will NOT auto-open the wizard
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
  // Wait for app to finish initial bootstrap (renderer signals idle)
  await window.waitForFunction(() => (window as any).__appIdle === true, {}, { timeout: 10000 });

  // Confirm the wizard is not visible initially
  let initiallyVisible = true;
  try {
    await window.waitForSelector('text=Welcome!', { timeout: 2000 });
    initiallyVisible = true;
  } catch {
    initiallyVisible = false;
  }
  expect(initiallyVisible).toBe(false);

  // Invoke the application menu item's click handler from the main process
  await electronApp.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    if (!menu) return;
    const fileMenu = menu.items.find((i: any) => i.label === 'File');
    if (!fileMenu || !fileMenu.submenu) return;
    const setupItem = fileMenu.submenu.items.find((si: any) => si.label === 'Setup Wizard');
    if (setupItem && typeof setupItem.click === 'function') setupItem.click();
  });

  // Wait for the setup wizard to appear
  await window.waitForSelector('text=Welcome!', { timeout: 5000 });
  const el = await window.$('text=Welcome!');
  expect(el).not.toBeNull();
});

export { test };
