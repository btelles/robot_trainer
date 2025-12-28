import { expect } from '@playwright/test';
import { test } from './fixtures';

test.describe('Robots CRUD', () => {
  test('create, edit, delete robot', async ({ window, setIpcHandlers }) => {
    // simple in-memory config store
    const store: Record<string, any> = {};
    await setIpcHandlers({
      'get-config': async (key: string) => {
        return store[key] || [];
      },
      'set-config': async (key: string, value: any) => {
        store[key] = value;
        return { ok: true };
      }
    });

    // pre-populate a robot in the in-memory config store
    store['resources.robots'] = [{ id: 'r1', serialNumber: 'R-001', name: 'Test Robot' }];

    // open Robots view from app nav
    await window.click('text=Robots');
    await window.waitForSelector('text=Robots');

    // ensure the prepopulated robot appears
    await window.waitForSelector('text=Test Robot');

    // edit the robot (editing uses the built-in form)
    await window.locator('text=Test Robot').locator('..').locator('text=Edit').click();
    const nameInput = await window.locator('input').nth(1);
    await nameInput.fill('Test Robot v2');
    await window.click('text=Save');
    await window.waitForSelector('text=Test Robot v2');

    // delete
    await window.locator('text=Test Robot v2').locator('..').locator('text=Delete').click();
    // ensure gone
    await expect(window.locator('text=Test Robot v2')).toHaveCount(0);
  });
});
