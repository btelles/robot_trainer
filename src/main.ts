import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'fs/promises';
import os from 'node:os';
import started from 'electron-squirrel-startup';
import { SerialPort } from 'serialport';
import { filterInterestingPorts } from './lib/serial_devices';
import runPythonScanner from './lib/python_scanner';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

// Handle Serial port port scanning from renderer process
const setupIpcHandlers = () => {
  ipcMain.handle('scan-serial-ports', async () => {
    try {
      const ports = await SerialPort.list();
      return ports.filter(filterInterestingPorts).map(port => {
        return {
          path: port.path,
          manufacturer: port.manufacturer || 'Unknown Manufacturer',
          serialNumber: port.serialNumber || 'N/A',
          productId: port.productId || 'N/A',
          vendorId: port.vendorId || 'N/A',
          pnpId: port.pnpId || 'N/A'
        }
      });
    } catch (error) {
      console.error('Error scanning Serial ports:', error);
      throw error;
    }
  });

  ipcMain.handle('save-system-settings', async (_event, settings) => {
    try {
      const userData = app.getPath('userData');
      const configPath = path.join(userData, 'system-settings.json');
      await fs.mkdir(userData, { recursive: true });
      await fs.writeFile(configPath, JSON.stringify(settings, null, 2), 'utf8');
      return { ok: true };
    } catch (error) {
      console.error('Error saving system settings:', error);
      throw error;
    }
  });

  ipcMain.handle('load-system-settings', async () => {
    try {
      const userData = app.getPath('userData');
      const configPath = path.join(userData, 'system-settings.json');
      let data: string | null = null;
      try {
        data = await fs.readFile(configPath, 'utf8');
      } catch (err) {
        data = null;
      }
      if (!data) return null;
      return JSON.parse(data);
    } catch (error) {
      console.error('Error loading system settings:', error);
      return null;
    }
  });

  ipcMain.handle('list-python-plugins', async (_event, options?: { pythonPath?: string; robots?: string[]; teleops?: string[] }) => {
    try {
      return await runPythonScanner(options);
    } catch (error) {
      console.error('Error running python plugin scanner:', error);
      throw error;
    }
  });

  // Check for local Anaconda/conda envs in the user's home directory and via PATH
  ipcMain.handle('check-anaconda', async () => {
    try {
      const home = app.getPath('home') || os.homedir();
      const candidates = ['anaconda3', 'Anaconda3', 'miniconda3', 'Miniconda3', 'miniconda', 'Miniconda', 'anaconda2', 'Anaconda2'];
      let detectedPath: string | null = null;
      for (const candidate of candidates) {
        const p = path.join(home, candidate, 'envs');
        try {
          const stat = await fs.stat(p);
          if (stat && stat.isDirectory()) {
            detectedPath = p;
            break;
          }
        } catch (e) {
          // ignore
        }
      }

      // Also check if `conda` is available on PATH
      const { spawnSync } = await import('node:child_process');
      let condaAvailable = false;
      let condaVersion = '';
      try {
        const result = spawnSync('conda', ['--version'], { encoding: 'utf8' });
        if (result.status === 0 && result.stdout) {
          condaAvailable = true;
          condaVersion = String(result.stdout).trim();
        }
      } catch (e) {
        // not available
      }

      if (!detectedPath && !condaAvailable) {
        return { found: false, path: null, envs: [], platform: process.platform, condaAvailable, condaVersion };
      }

      const envs: Array<{ name: string; pythonPath?: string | null }> = [];

      if (detectedPath) {
        const entries = await fs.readdir(detectedPath, { withFileTypes: true });
        for (const e of entries) {
          if (!e.isDirectory()) continue;
          const envName = e.name;
          const envRoot = path.join(detectedPath, envName);
          // check for common python executable locations
          const candidatesExec: string[] = [];
          if (process.platform === 'win32') {
            candidatesExec.push(path.join(envRoot, 'python.exe'));
            candidatesExec.push(path.join(envRoot, 'Scripts', 'python.exe'));
          } else {
            candidatesExec.push(path.join(envRoot, 'bin', 'python'));
            candidatesExec.push(path.join(envRoot, 'bin', 'python3'));
          }
          let foundExec: string | null = null;
          for (const c of candidatesExec) {
            try {
              const st = await fs.stat(c);
              if (st.isFile()) {
                foundExec = c;
                break;
              }
            } catch (e) {
              // ignore
            }
          }
          envs.push({ name: envName, pythonPath: foundExec });
        }
      }

      return { found: true, path: detectedPath, envs, platform: process.platform, condaAvailable, condaVersion };
    } catch (error: any) {
      console.error('Error checking Anaconda envs:', error);
      return { found: false, path: null, envs: [], platform: process.platform, error: String(error) };
    }
  });

  ipcMain.handle('create-anaconda-env', async (_event, name: string) => {
    try {
      const { spawn } = await import('node:child_process');
      const home = app.getPath('home') || os.homedir();

      // Candidate conda executables to try (PATH first, then common install locations)
      const candidates: string[] = [];
      // use plain 'conda' to allow PATH resolution
      candidates.push('conda');

      if (process.platform === 'win32') {
        candidates.push(path.join(home, 'Anaconda3', 'condabin', 'conda.bat'));
        candidates.push(path.join(home, 'Anaconda3', 'Scripts', 'conda.exe'));
        candidates.push(path.join(home, 'Miniconda3', 'condabin', 'conda.bat'));
        candidates.push(path.join(home, 'Miniconda3', 'Scripts', 'conda.exe'));
      } else {
        candidates.push(path.join(home, 'miniconda3', 'bin', 'conda'));
        candidates.push(path.join(home, 'anaconda3', 'bin', 'conda'));
        candidates.push('/opt/miniconda3/bin/conda');
        candidates.push('/opt/anaconda3/bin/conda');
      }

      // Choose the first candidate that exists (or fallback to 'conda')
      let chosen: string | null = null;
      for (const c of candidates) {
        if (c === 'conda') { chosen = c; break; }
        try {
          const st = await fs.stat(c);
          if (st && st.isFile()) { chosen = c; break; }
        } catch (e) {
          // ignore
        }
      }
      if (!chosen) chosen = 'conda';

      const args = ['create', '-n', name, '--yes'];

      return await new Promise((resolve) => {
        const child = spawn(chosen!, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
        let out = '';
        let err = '';
        child.stdout.on('data', (chunk) => out += chunk.toString());
        child.stderr.on('data', (chunk) => err += chunk.toString());
        child.on('close', (code) => {
          const success = code === 0;
          resolve({ success, code: code ?? -1, output: out + (err ? `\n${err}` : '') });
        });
        child.on('error', (e) => {
          resolve({ success: false, code: -1, output: String(e) });
        });
      });
    } catch (error: any) {
      console.error('Error creating conda env:', error);
      return { success: false, code: -1, output: String(error) };
    }
  });

  ipcMain.handle('save-robot-config', async (_event, config: any) => {
    try {
      const home = app.getPath('home');
      const dir = path.join(home, 'robot_trainer');
      const outPath = path.join(dir, 'config.json');
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(outPath, JSON.stringify(config, null, 2), 'utf8');
      return { ok: true, path: outPath };
    } catch (error) {
      console.error('Error saving robot config:', error);
      throw error;
    }
  });
};

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      devTools: true
    },
  });
  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Open the DevTools.
//  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  setupIpcHandlers();
  createWindow();
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
