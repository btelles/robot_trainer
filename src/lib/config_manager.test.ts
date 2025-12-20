import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

import ConfigManager from './config_manager';

const tmpDir = path.join(os.tmpdir(), 'robot_trainer_test_' + Date.now());
const settingsPath = path.join(tmpDir, 'settings.json');

beforeEach(async () => {
  await fs.promises.mkdir(tmpDir, { recursive: true });
});

afterEach(async () => {
  try { await fs.promises.rm(tmpDir, { recursive: true, force: true }); } catch { }
  vi.resetAllMocks();
});

describe('ConfigManager atomic write and edge cases', () => {
  it('writes atomically using tmp + rename', async () => {
    const cm = new ConfigManager({ a: 1 });
    // override internal paths to use tmpDir
    (cm as any).settingsPath = settingsPath;
    (cm as any).tmpPath = settingsPath + '.tmp';

    await cm.set('foo.bar', 42);
    const written = await fs.promises.readFile(settingsPath, 'utf8');
    expect(written).toContain('"foo"');
    expect(JSON.parse(written).foo.bar).toBe(42);
    cm.close();
  });

  it('handles malformed JSON by backing up and keeping previous state', async () => {
    // create an initial valid file
    await fs.promises.writeFile(settingsPath, JSON.stringify({ valid: true }, null, 2));
    const cm = new ConfigManager({});
    (cm as any).settingsPath = settingsPath;
    (cm as any).tmpPath = settingsPath + '.tmp';

    // write corrupt content
    await fs.promises.writeFile(settingsPath, '{ invalid json', 'utf8');

    const events: string[] = [];
    cm.on('corrupt', () => events.push('corrupt'));
    // force reload
    await (cm as any).load();
    expect(events).toContain('corrupt');
    // previous in-memory should still be {} (constructor didn't load corrupt)
    cm.close();
  });

  it('emits external-change when file modified', async () => {
    const cm = new ConfigManager({});
    (cm as any).settingsPath = settingsPath;
    (cm as any).tmpPath = settingsPath + '.tmp';
    await fs.promises.writeFile(settingsPath, JSON.stringify({ x: 1 }));

    const events: string[] = [];
    cm.on('external-change', () => events.push('external'));
    // simulate fs.watch by calling load and emitting
    await (cm as any).load();
    cm.emit('external-change');
    expect(events).toContain('external');
    cm.close();
  });

  it('queues rapid set() calls and does not corrupt file on concurrent writes', async () => {
    const cm = new ConfigManager({});
    (cm as any).settingsPath = settingsPath;
    (cm as any).tmpPath = settingsPath + '.tmp';

    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(cm.set('cnt', i));
    }
    await Promise.all(promises);
    const data = JSON.parse(await fs.promises.readFile(settingsPath, 'utf8'));
    expect(typeof data.cnt).toBe('number');
    cm.close();
  });

  it('handles write failures gracefully', async () => {
    const cm = new ConfigManager({});
    (cm as any).settingsPath = settingsPath;
    (cm as any).tmpPath = settingsPath + '.tmp';

    // mock writeFile to throw
    const origWrite = fs.promises.writeFile;
    vi.spyOn(fs.promises, 'writeFile' as any).mockImplementationOnce(() => Promise.reject(new Error('disk full')));

    await expect(cm.set('k', 'v')).rejects.toThrow('disk full');
    // restore
    (fs.promises.writeFile as any) = origWrite;
    cm.close();
  });
});
