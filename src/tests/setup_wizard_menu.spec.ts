import { test } from './fixtures';
import { expect } from '@playwright/test';

// Validates that selecting the main menu File -> Setup Wizard opens the wizard
test('File -> Setup Wizard opens the SetupWizard modal', async ({ window, electronApp, setIpcHandlers }) => {
  test.setTimeout(30000);
  await setIpcHandlers({
    'check-anaconda': async () => ({
      found: true,
      path: '/home/testuser/miniconda3',
      envs: [{ name: 'robot_trainer', pythonPath: '/home/testuser/miniconda3/envs/robot_trainer/bin/python' }],
      platform: 'linux'
    }),
    'check-lerobot': async () => ({ installed: true }),
    'save-system-settings': async () => { return; },
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
  await window.waitForFunction(() => (window as any).__appIdle === true, {}, { timeout: 30000 });

  // Confirm the wizard is not visible initially
  const wizardText = window.locator('text=Welcome!');
  await expect(wizardText).not.toBeVisible();

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
  await expect(wizardText).toBeVisible({ timeout: 5000 });
});

test('Setup Wizard steps show details', async ({ window, electronApp, setIpcHandlers }) => {
  
  // Mock handlers to simulate a fresh install flow
  // Note: We mock check-anaconda to return false initially so the "Install" button appears.
  await setIpcHandlers({
    'check-anaconda': async () => ({ found: false, path: null, envs: [], platform: 'linux' }),
    'install-miniconda': async () => {
      // @ts-ignore
      const { BrowserWindow } = globalThis;
      const wins = BrowserWindow.getAllWindows();
      wins.forEach((w: any) => {
        w.webContents.send('install-miniconda-output', 'Miniconda installed successfully\n');
      });
      
      await new Promise(resolve => setTimeout(resolve, 500));

      wins.forEach((w: any) => {
        w.webContents.send('install-miniconda-output', 'Done.');
      });
      return { success: true, path: '/tmp/miniconda', output: 'Miniconda installed successfully\nDone.' };
    },
    'check-lerobot': async () => ({ installed: false }),
    'save-system-settings': async () => { return; },
  });

  // Force open wizard via menu
  await window.waitForLoadState('domcontentloaded');
  await window.waitForFunction(() => (window as any).__appIdle === true, {}, { timeout: 2000 });

  await electronApp.evaluate(({ Menu }) => {
    const menu = Menu.getApplicationMenu();
    const fileMenu = menu?.items.find((i: any) => i.label === 'File');
    const setupItem = fileMenu?.submenu?.items.find((si: any) => si.label === 'Setup Wizard');
    setupItem?.click();
  });

  await expect(window.locator('text=Welcome!')).toBeVisible();

  // Step 1 should be open and show "Install Miniconda"
  const installBtn = window.locator('button:has-text("Install Miniconda")');
  await expect(installBtn).toBeVisible();

  // Click install
  await installBtn.click();

  // Wait for "See Details" to appear
  const detailsBtn = window.locator('button:has-text("See Details")');
  await expect(detailsBtn).toBeVisible();

  // Click "See Details"
  await detailsBtn.click();

  // Validate that the details section is visible and contains expected text
  await expect(window.locator('text=Miniconda installed successfully')).toBeVisible();
});
