import { expect } from '@playwright/test';
import { test } from './fixtures';

test('Training Studio starts simulation with provided config', async ({ window, setIpcHandlers, electronApp }) => {
  await setIpcHandlers({
    'start-simulation': async (cfg: any) => {
      // record last received config on main global for inspection
      // @ts-ignore
      (global as any)._lastStartSimConfig = cfg;
      return { ok: true, wsUrl: 'ws://localhost:9999' };
    }
  });

  // Navigate to Training Studio
  await window.click('text=Training Studio');
  await window.waitForSelector('text=Training Studio');

  // Fill config fields
  await window.getByLabel('Repo ID').fill('my/repo');
  await window.getByLabel('Policy Type').selectOption('act');
  await window.getByLabel('Episodes').fill('5');
  await window.getByLabel('FPS').fill('30');

  // Start simulation
  await window.click('text=Start Simulation');

  // Wait for UI to show simulation running
  await window.waitForSelector('text=Stop Simulation');
  // Video player should appear (canvas element)
  await window.waitForSelector('canvas');

  // Inspect what main received
  const lastCfg = await electronApp.evaluate(() => {
    // @ts-ignore
    return (global as any)._lastStartSimConfig;
  });

  expect(lastCfg).toBeTruthy();
  expect(lastCfg.repo_id).toBe('my/repo');
  expect(lastCfg.policy_type).toBe('act');
  expect(String(lastCfg.num_episodes)).toBe('5');
  expect(String(lastCfg.fps)).toBe('30');
});
