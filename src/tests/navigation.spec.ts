import { expect } from '@playwright/test';
import { test } from './fixtures';

test.describe('Navigation resets ResourceManager form', () => {
  test('opening form then navigating away clears showForm state', async ({ window, setIpcHandlers }) => {
    const store: Record<string, any> = {};
    await setIpcHandlers({
      'get-config': async (key: string) => store[key] || [],
      'set-config': async (key: string, value: any) => { store[key] = value; return { ok: true }; }
    });

    // Open Robots view
    await window.click('text=Robots');
    await window.waitForSelector('text=Robots');

    // Click Add to open form (showForm = true -> renders SetupWizard because renderForm returns it)
    await window.click('text=Add Robot');
    await window.click('text=Create');
    // SetupWizard should be visible
    await window.waitForSelector('text=Setup New Robot');

    // Navigate to Home
    await window.click('text=Home');
    await window.waitForSelector('text=Home');

    // Navigate back to Robots - the ResourceManager should show list (not form)
    await window.click('text=Robots');
    await window.waitForSelector('text=Robots');

    // Ensure SetupWizard is not present and Add Robot button visible
    await expect(window.locator('text=Setup New Robot')).toHaveCount(0);
    await expect(window.locator('text=Add Robot')).toHaveCount(1);
  });
});
