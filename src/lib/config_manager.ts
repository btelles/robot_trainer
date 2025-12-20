import fs from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';

type JSONObject = { [k: string]: any };

function deepMerge(a: any, b: any): any {
  if (Array.isArray(a) && Array.isArray(b)) return b;
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const out: any = { ...a };
    for (const k of Object.keys(b)) {
      out[k] = deepMerge(a[k], b[k]);
    }
    return out;
  }
  return b === undefined ? a : b;
}

export default class ConfigManager extends EventEmitter {
  private defaults: JSONObject;
  private userSettings: JSONObject = {};
  private settingsPath: string;
  private tmpPath: string;
  private writing = false;
  private writeQueue: Array<() => Promise<void>> = [];
  private watcher?: fs.FSWatcher;

  constructor(defaults: JSONObject = {}) {
    super();
    this.defaults = defaults;
    const userData = (process as any).electronAppPath || undefined;
    // prefer electron.app.getPath('userData') if available at runtime
    let baseDir: string;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const electron = require('electron');
      baseDir = (electron.app && electron.app.getPath) ? electron.app.getPath('userData') : (userData || path.join(os.homedir(), '.config', 'robot_trainer'));
    } catch (e) {
      baseDir = (userData || path.join(os.homedir(), '.config', 'robot_trainer'));
    }
    this.settingsPath = path.join(baseDir, 'settings.json');
    this.tmpPath = this.settingsPath + '.tmp';
    this.load();
    this.watch();
  }

  private safeParse(data: string): JSONObject | null {
    try {
      return JSON.parse(data);
    } catch (err) {
      return null;
    }
  }

  private async ensureDir() {
    const dir = path.dirname(this.settingsPath);
    await fs.promises.mkdir(dir, { recursive: true });
  }

  private async load() {
    try {
      await this.ensureDir();
      const raw = await fs.promises.readFile(this.settingsPath, 'utf8').catch(() => null);
      if (!raw) {
        this.userSettings = {};
        this.emit('loaded');
        return;
      }
      const parsed = this.safeParse(raw);
      if (!parsed) {
        // backup corrupt file
        const corruptPath = this.settingsPath + '.corrupt';
        await fs.promises.copyFile(this.settingsPath, corruptPath).catch(() => { });
        this.emit('corrupt', this.settingsPath);
        return;
      }
      this.userSettings = parsed;
      this.emit('loaded');
    } catch (err) {
      this.emit('error', err);
    }
  }

  public get(key?: string) {
    if (!key) return deepMerge(this.defaults, this.userSettings);
    const parts = key.split('.');
    let curUser: any = this.userSettings;
    for (const p of parts) {
      if (curUser && Object.prototype.hasOwnProperty.call(curUser, p)) curUser = curUser[p];
      else { curUser = undefined; break; }
    }
    if (curUser !== undefined) return curUser;
    let curDef: any = this.defaults;
    for (const p of parts) {
      if (curDef && Object.prototype.hasOwnProperty.call(curDef, p)) curDef = curDef[p];
      else { curDef = undefined; break; }
    }
    return curDef;
  }

  public async set(key: string, value: any) {
    const task = async () => {
      // update in-memory
      const parts = key.split('.');
      let o: any = this.userSettings || {};
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts[i];
        if (!o[p] || typeof o[p] !== 'object') o[p] = {};
        o = o[p];
      }
      o[parts[parts.length - 1]] = value;

      // write atomically
      try {
        await this.ensureDir();
        const data = JSON.stringify(this.userSettings, null, 2) + '\n';
        await fs.promises.writeFile(this.tmpPath, data, 'utf8');
        // flush to disk
        const fd = await fs.promises.open(this.tmpPath, 'r');
        try { await fd.sync(); } finally { await fd.close(); }
        await fs.promises.rename(this.tmpPath, this.settingsPath);
        this.emit('changed', key, value);
      } catch (err: any) {
        // handle permission issues
        this.emit('error', err);
        // attempt to cleanup tmp
        try { await fs.promises.unlink(this.tmpPath).catch(() => { }); } catch { }
        throw err;
      }
    };

    return new Promise<void>((resolve, reject) => {
      this.writeQueue.push(async () => {
        try { await task(); resolve(); } catch (e) { reject(e); }
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.writing) return;
    this.writing = true;
    while (this.writeQueue.length) {
      const job = this.writeQueue.shift()!;
      try { await job(); } catch (e) { /* swallow - individual callers get rejection */ }
    }
    this.writing = false;
  }

  private watch() {
    try {
      const dir = path.dirname(this.settingsPath);
      this.watcher = fs.watch(dir, (eventType, filename) => {
        if (!filename) return;
        if (filename === path.basename(this.settingsPath)) {
          // reload
          this.load();
          this.emit('external-change');
        }
      });
    } catch (err) {
      // ignore watcher errors
      this.emit('error', err);
    }
  }

  public close() {
    try { this.watcher?.close(); } catch { }
  }
}
