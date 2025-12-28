import { expect } from '@playwright/test';
import { test } from './fixtures';

test.describe('Cameras CRUD', () => {
  test('create, edit, delete camera', async ({ window, setIpcHandlers }) => {
    const store: Record<string, any> = {};
    await setIpcHandlers({
      'get-config': async (key: string) => store[key] || [],
      'set-config': async (key: string, value: any) => { store[key] = value; return { ok: true }; }
    });

    await window.click('text=Cameras');
    await window.waitForSelector('text=Cameras');

    await window.click('text=Add Camera');
    const inputs = await window.locator('input').all();
    await inputs[0].fill('CAM-1');
    await inputs[1].fill('Front Cam');
    await inputs[2].fill('1920x1080');
    await inputs[3].fill('30');
    await window.click('button:is(:text("Create"))');
    // await window.locator('text=Create').highlight();
    await window.waitForSelector('text=Front Cam');

    // edit
    await window.click('text=Edit');
    await window.locator('input').nth(1).fill('Front Camera v2');
    await window.click('text=Save');
    await window.waitForSelector('text=Front Camera v2');

    // delete
    await window.click('text=Delete');
    await expect(window.locator('text=Front Camera v2')).toHaveCount(0);
  });
});
