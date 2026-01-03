import { app, BrowserWindow, ipcMain, Menu } from 'electron';
import path from 'node:path';
import fs from 'fs/promises';
import os from 'node:os';
import started from 'electron-squirrel-startup';
import { SerialPort } from 'serialport';
import { filterInterestingPorts } from './lib/serial_devices';
import runPythonScanner from './lib/python_scanner';
import migrations from './db/migrations.json';

import { VideoManager } from './lib/VideoManager';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string;
declare const MAIN_WINDOW_VITE_NAME: string;

let mainWindow: BrowserWindow | null = null;
const videoManagers = new Map<string, VideoManager>();

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

let systemSettings: any = {};

const loadSystemSettings = async () => {
  // Ask the renderer (which owns the drizzle DB) for the settings.
  // Wait until the main window is ready, then send a request and await a reply.
  try {
    if (!mainWindow) return;
    await new Promise<void>((resolve) => {
      if (mainWindow!.webContents.isLoading()) {
        mainWindow!.webContents.once('did-finish-load', () => resolve());
      } else resolve();
    });

    // Send request to renderer
    mainWindow.webContents.send('request-load-system-settings');

    // Wait for renderer reply, with timeout fallback to existing file-based config
    const data = await new Promise<any>((resolve) => {
      let handled = false;
      const to = setTimeout(async () => {
        if (handled) return;
        handled = true;
        try {
          const p = path.join(app.getPath('userData'), 'system-settings.json');
          const fileData = await fs.readFile(p, 'utf8');
          resolve(JSON.parse(fileData));
        } catch (_e) {
          resolve({});
        }
      }, 2000);

      ipcMain.once('reply-load-system-settings', (_ev, payload) => {
        if (handled) return;
        handled = true;
        resolve(payload || {});
      });
    });

    systemSettings = data || {};
  } catch (e) {
    // fallback to file-based if anything goes wrong
    try {
      const p = path.join(app.getPath('userData'), 'system-settings.json');
      const data = await fs.readFile(p, 'utf8');
      systemSettings = JSON.parse(data);
    } catch (_e) {
      systemSettings = {};
    }
  }
};

// Handle Serial port port scanning from renderer process
const setupIpcHandlers = () => {

  ipcMain.handle('get-migrations', async () => {
    return migrations;
  });

  ipcMain.handle('save-system-settings', async (_event, settings: any) => {
    // Forward save request to renderer so it can persist via Drizzle (users table)
    try {
      if (mainWindow) {
        mainWindow.webContents.send('request-save-system-settings', settings);

        // Wait for renderer reply (with timeout fallback to file write)
        const result = await new Promise<any>((resolve) => {
          let done = false;
          const to = setTimeout(async () => {
            if (done) return;
            done = true;
            try {
              const p = path.join(app.getPath('userData'), 'system-settings.json');
              systemSettings = { ...systemSettings, ...settings };
              await fs.writeFile(p, JSON.stringify(systemSettings, null, 2), 'utf8');
              mainWindow?.webContents.send('system-settings-changed', systemSettings);
              resolve({ success: true });
            } catch (e) {
              resolve({ success: false, error: String(e) });
            }
          }, 2000);

          ipcMain.once('reply-save-system-settings', (_ev, payload) => {
            if (done) return;
            done = true;
            clearTimeout(to);
            if (payload && payload.success) {
              systemSettings = { ...systemSettings, ...(payload.settings || settings) };
              mainWindow?.webContents.send('system-settings-changed', systemSettings);
            }
            resolve(payload);
          });
        });

        return result;
      }

      // No mainWindow – fallback to file
      const p = path.join(app.getPath('userData'), 'system-settings.json');
      systemSettings = { ...systemSettings, ...settings };
      await fs.writeFile(p, JSON.stringify(systemSettings, null, 2), 'utf8');
      return { success: true };
    } catch (e) {
      console.error(e);
      throw e;
    }
  });

  ipcMain.handle('install-miniconda', async () => {
    try {
      const platform = process.platform;
      const arch = process.arch;
      let url = '';
      let installerName = '';

      if (platform === 'linux') {
        url = 'https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh';
        installerName = 'miniconda.sh';
      } else if (platform === 'darwin') {
        url = arch === 'arm64'
          ? 'https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-arm64.sh'
          : 'https://repo.anaconda.com/miniconda/Miniconda3-latest-MacOSX-x86_64.sh';
        installerName = 'miniconda.sh';
      } else if (platform === 'win32') {
        url = 'https://repo.anaconda.com/miniconda/Miniconda3-latest-Windows-x86_64.exe';
        installerName = 'miniconda.exe';
      } else {
        throw new Error(`Unsupported platform: ${platform}`);
      }

      const userDataPath = app.getPath('userData');
      const installerPath = path.join(userDataPath, installerName);
      const installPath = path.join(userDataPath, 'miniconda3');

      // Download
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to download Miniconda: ${response.statusText}`);
      const buffer = await response.arrayBuffer();
      await fs.writeFile(installerPath, Buffer.from(buffer));
      await fs.chmod(installerPath, 0o755);

      // Install
      const { spawn } = await import('node:child_process');
      let args: string[] = [];
      let cmd = '';

      if (platform === 'win32') {
        cmd = installerPath;
        args = ['/InstallationType=JustMe', '/RegisterPython=0', '/S', `/D=${installPath}`];
      } else {
        cmd = '/bin/bash';
        args = [installerPath, '-b', '-p', installPath];
      }

      await new Promise<void>((resolve, reject) => {
        const child = spawn(cmd, args, { stdio: 'inherit' });
        child.on('close', (code) => {
          if (code === 0) resolve();
          else reject(new Error(`Miniconda installation failed with code ${code}`));
        });
        child.on('error', reject);
      });

      // Cleanup
      await fs.unlink(installerPath);

      // Update in-memory settings so UI can react; renderer may persist this.
      systemSettings = { ...systemSettings, condaRoot: installPath };
      mainWindow?.webContents.send('system-settings-changed', systemSettings);

      return { success: true, path: installPath };
    } catch (error: any) {
      console.error('Error installing Miniconda:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('install-lerobot', async () => {
    try {
      // Prefer using `conda run -n robot_trainer` if we have a conda root saved
      const { spawn } = await import('node:child_process');

      // Try to use conda from systemSettings.condaRoot or from userData/miniconda3
      let condaExec: string | null = null;
      if (systemSettings && systemSettings.condaRoot) {
        const candidate = path.join(systemSettings.condaRoot, process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'conda.exe' : 'conda');
        try {
          const st = await fs.stat(candidate);
          if (st.isFile()) condaExec = candidate;
        } catch (e) {
          // ignore
        }
      }

      if (!condaExec) {
        const userDataPath = app.getPath('userData');
        const candidate = path.join(userDataPath, 'miniconda3', 'bin', 'conda');
        try {
          const st = await fs.stat(candidate);
          if (st.isFile()) condaExec = candidate;
        } catch (e) {
          // ignore
        }
      }

      if (condaExec) {
        // Use conda run to ensure the environment is activated for the install
        return await new Promise((resolve) => {
          const child_pip_install = spawn(condaExec, ['install', '-n', 'robot_trainer', 'pip'], { stdio: ['ignore', 'pipe', 'pipe'] });
          let out = '';
          let err = '';
          child_pip_install.stdout.on('data', (d: any) => out += d);
          child_pip_install.stderr.on('data', (d: any) => err += d);
          child_pip_install.on('close', (code) => {
            if (code !== 0) {
              resolve({ success: false, output: out + err });
            }
            const child_lerobot_install = spawn(condaExec, ['run', '-n', 'robot_trainer', 'python', '-m', 'pip', 'install', 'lerobot'], { stdio: ['ignore', 'pipe', 'pipe'] });
            child_lerobot_install.stdout.on('data', (d: any) => out += d);
            child_lerobot_install.stderr.on('data', (d: any) => err += d);
            child_lerobot_install.on('close', (code) => {
              return ({ success: code === 0, output: out + err });
            });
            child_lerobot_install.on('error', (e) => {
              return ({ success: false, output: String(e) });
            });
          });
        });
      }

      // Fallback: try direct python binary from systemSettings.pythonPath or usual env location
      let pythonPath = systemSettings.pythonPath;
      if (!pythonPath) {
        const userDataPath = app.getPath('userData');
        const envPath = path.join(userDataPath, 'miniconda3', 'envs', 'robot_trainer');
        pythonPath = process.platform === 'win32' ? path.join(envPath, 'python.exe') : path.join(envPath, 'bin', 'python');
      }

      return await new Promise((resolve) => {
        const child = spawn(pythonPath, ['-m', 'pip', 'install', 'lerobot'], { stdio: ['ignore', 'pipe', 'pipe'] });
        let out = '';
        let err = '';
        child.stdout.on('data', (d: any) => out += d);
        child.stderr.on('data', (d: any) => err += d);
        child.on('close', (code) => resolve({ success: code === 0, output: out + err }));
        child.on('error', (e) => resolve({ success: false, output: String(e) }));
      });
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('check-lerobot', async () => {
    try {
      const { spawn } = await import('node:child_process');

      // Prefer conda run if available (ensures correct env activation)
      let condaExec: string | null = null;
      if (systemSettings && systemSettings.condaRoot) {
        const candidate = path.join(systemSettings.condaRoot, process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'conda.exe' : 'conda');
        try {
          const st = await fs.stat(candidate);
          if (st.isFile()) condaExec = candidate;
        } catch (e) {
          // ignore
        }
      }

      if (!condaExec) {
        const userDataPath = app.getPath('userData');
        const candidate = path.join(userDataPath, 'miniconda3', 'bin', 'conda');
        try {
          const st = await fs.stat(candidate);
          if (st.isFile()) condaExec = candidate;
        } catch (e) {
          // ignore
        }
      }

      if (condaExec) {
        return await new Promise((resolve) => {
          const child = spawn(condaExec, ['run', '-n', 'robot_trainer', 'python', '-c', 'import lerobot'], { stdio: ['ignore', 'pipe', 'pipe'] });
          child.on('close', (code) => resolve({ installed: code === 0 }));
          child.on('error', () => resolve({ installed: false }));
        });
      }

      // Fallback: directly call env python if known
      let pythonPath = systemSettings.pythonPath;
      if (!pythonPath) {
        const userDataPath = app.getPath('userData');
        const envPath = path.join(userDataPath, 'miniconda3', 'envs', 'robot_trainer');
        pythonPath = process.platform === 'win32' ? path.join(envPath, 'python.exe') : path.join(envPath, 'bin', 'python');
      }

      return await new Promise((resolve) => {
        const child = spawn(pythonPath, ['-c', 'import lerobot'], { stdio: 'ignore' });
        child.on('close', (code) => resolve({ installed: code === 0 }));
        child.on('error', () => resolve({ installed: false }));
      });
    } catch (e) {
      return { installed: false };
    }
  });

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
      const userData = app.getPath('userData');
      const candidateNames = ['anaconda3', 'Anaconda3', 'miniconda3', 'Miniconda3', 'miniconda', 'Miniconda', 'anaconda2', 'Anaconda2'];
      let condaRoot: string | null = null;

      // Check common locations under the user's home and the app userData folder
      for (const candidate of candidateNames) {
        const homeCandidate = path.join(home, candidate);
        try {
          const st = await fs.stat(homeCandidate);
          if (st && st.isDirectory()) { condaRoot = homeCandidate; break; }
        } catch (e) {
          // ignore
        }
        const userDataCandidate = path.join(userData, candidate);
        try {
          const st2 = await fs.stat(userDataCandidate);
          if (st2 && st2.isDirectory()) { condaRoot = userDataCandidate; break; }
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

      if (!condaRoot && !condaAvailable) {
        return { found: false, path: null, envs: [], platform: process.platform, condaAvailable, condaVersion };
      }

      const envs: Array<{ name: string; pythonPath?: string | null }> = [];

      if (condaRoot) {
        const envsDir = path.join(condaRoot, 'envs');
        try {
          const entries = await fs.readdir(envsDir, { withFileTypes: true });
          for (const e of entries) {
            if (!e.isDirectory()) continue;
            const envName = e.name;
            const envRoot = path.join(envsDir, envName);
            // check for common python executable locations inside the env
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
                if (st.isFile()) { foundExec = c; break; }
              } catch (e) {
                // ignore
              }
            }
            envs.push({ name: envName, pythonPath: foundExec });
          }
        } catch (e) {
          // no envs dir or unreadable
        }
      }

      return { found: true, path: condaRoot, envs, platform: process.platform, condaAvailable, condaVersion };
    } catch (error: any) {
      console.error('Error checking Anaconda envs:', error);
      return { found: false, path: null, envs: [], platform: process.platform, error: String(error) };
    }
  });

  ipcMain.handle('create-anaconda-env', async (_event, name: string) => {
    try {
      const { spawn } = await import('node:child_process');
      const home = app.getPath('home') || os.homedir();
      // Build candidate conda executables, preferring any configured condaRoot and app userData
      const userData = app.getPath('userData');
      const candidates: string[] = [];

      // If system had a condaRoot configured, prefer its conda executable
      if (systemSettings && systemSettings.condaRoot) {
        const sysCandidate = path.join(systemSettings.condaRoot, process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'conda.exe' : 'conda');
        candidates.push(sysCandidate);
      }

      // Prefer conda under app userData (where we install Miniconda)
      if (process.platform === 'win32') {
        candidates.push(path.join(userData, 'Miniconda3', 'Scripts', 'conda.exe'));
      } else {
        candidates.push(path.join(userData, 'miniconda3', 'bin', 'conda'));
      }

      // Then check common home locations
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

      // Finally, allow 'conda' on PATH
      candidates.push('conda');

      // Choose first existing candidate (or 'conda')
      let chosen: string | null = null;
      for (const c of candidates) {
        if (c === 'conda') { chosen = 'conda'; break; }
        try {
          const st = await fs.stat(c);
          if (st && st.isFile()) { chosen = c; break; }
        } catch (e) {
          // ignore
        }
      }
      if (!chosen) chosen = 'conda';

      // Explicitly request python to ensure the env contains binaries
      const args = ['create', '-n', name, 'python', '--yes'];

      return await new Promise((resolve) => {
        const child = spawn(chosen!, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
        let out = '';
        let err = '';
        child.stdout.on('data', (chunk) => out += chunk.toString());
        child.stderr.on('data', (chunk) => err += chunk.toString());
        child.on('close', (code) => {
          const success = code === 0;
          (async () => {
            if (success) {
              // Attempt to determine condaRoot and the env python path, then save to systemSettings
              try {
                let condaRootDetected: string | null = null;
                if (chosen && chosen !== 'conda') {
                  const chosenDir = path.dirname(chosen);
                  const base = path.basename(chosenDir);
                  if (['bin', 'Scripts', 'condabin'].includes(base)) {
                    condaRootDetected = path.dirname(chosenDir);
                  } else {
                    condaRootDetected = chosenDir;
                  }
                }

                // If still not found, leave as null
                const envPython = condaRootDetected ? (process.platform === 'win32' ? path.join(condaRootDetected, 'envs', name, 'python.exe') : path.join(condaRootDetected, 'envs', name, 'bin', 'python')) : null;

                // If python binary missing, try installing python into the env
                if (envPython) {
                  try {
                    const st = await fs.stat(envPython);
                    if (!st.isFile()) throw new Error('python not found');
                  } catch (e) {
                    // Try to install python into the env
                    try {
                      await new Promise<void>((res, rej) => {
                        const installer = spawn(chosen!, ['install', '-n', name, 'python', '--yes'], { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32' });
                        installer.on('close', (c) => c === 0 ? res() : rej(new Error('failed to install python')));
                        installer.on('error', rej);
                      });
                    } catch (_e) {
                      // ignore; env may still be usable via conda run
                    }
                  }
                }

                // Update in-memory settings
                if (condaRootDetected) {
                  systemSettings = { ...systemSettings, condaRoot: condaRootDetected };
                }
                if (envPython) {
                  systemSettings = { ...systemSettings, pythonPath: envPython };
                }
                mainWindow?.webContents.send('system-settings-changed', systemSettings);
              } catch (e) {
                // ignore errors here
              }
            }
            resolve({ success, code: code ?? -1, output: out + (err ? `\n${err}` : '') });
          })();
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

  // Start a simulation process (spawns Python simulator) and stream frames
  ipcMain.handle('start-simulation', async () => {
    try {
      const id = 'simulation';
      if (videoManagers.has(id)) {
        return { ok: false, message: 'simulation already running' };
      }

      const candidates = [
        path.join(process.cwd(), 'src', 'python', 'simulate.py'),
        path.join(__dirname, '..', 'python', 'simulate.py'),
        path.join(process.resourcesPath || '', 'simulate.py'),
      ];

      let scriptPath: string | null = null;
      for (const c of candidates) {
        try {
          const st = await fs.stat(c as any);
          if (st) {
            scriptPath = c;
            break;
          }
        } catch (e) {
          // try next
        }
      }

      if (!scriptPath) {
        throw new Error('simulate.py not found');
      }

      // Try to find the venv python if in dev mode
      let pythonExec = 'python3';
      if (systemSettings.pythonPath) {
        pythonExec = systemSettings.pythonPath;
      } else {
        const venvPython = path.join(process.cwd(), 'src', 'python', '.venv', 'bin', 'python');
        try {
          const st = await fs.stat(venvPython);
          if (st.isFile()) {
            pythonExec = venvPython;
          }
        } catch (e) {
          // ignore
        }
      }

      // Check for bundled executable (production)
      // If packaged, the python script might be compiled to an executable
      // We can check if a 'simulate' binary exists in resources
      const bundledSim = path.join(process.resourcesPath, 'src', 'python', 'dist', 'simulate');
      try {
        const st = await fs.stat(bundledSim);
        if (st.isFile()) {
          pythonExec = bundledSim;
          scriptPath = ''; // Executable doesn't need script path arg
        }
      } catch (e) {
        // ignore
      }

      const vm = new VideoManager(9999);
      const recordingPath = path.join(app.getPath('userData'), `simulation_${Date.now()}.mp4`);

      const args = scriptPath ? [scriptPath] : [];
      // If using python executable with script, args is [scriptPath]
      // If using bundled executable, args is []
      // VideoManager.startSimulation takes (pythonPath, scriptPath, ...)
      // We need to adjust VideoManager to handle this or just pass empty scriptPath if it's an executable

      // Let's assume VideoManager expects a command and args.
      // Currently it is: spawn(pythonPath, [scriptPath], ...)
      // We should update VideoManager to take args array instead of just scriptPath

      // For now, let's just pass scriptPath as is. If it's empty, spawn might fail if we pass ['']
      // So let's update VideoManager first to be more flexible.

      await vm.startSimulation(pythonExec, scriptPath, recordingPath);
      videoManagers.set(id, vm);

      return { ok: true, wsUrl: 'ws://localhost:9999' };
    } catch (error) {
      console.error('start-simulation failed', error);
      throw error;
    }
  });

  ipcMain.handle('stop-simulation', async () => {
    const id = 'simulation';
    const vm = videoManagers.get(id);
    if (vm) {
      vm.stopAll();
      vm.stopServer();
      videoManagers.delete(id);
    }
    return { ok: true };
  });

  ipcMain.handle('start-camera', async (_event, devicePath: string) => {
    try {
      const id = `camera_${devicePath}`;
      if (videoManagers.has(id)) return { ok: false, message: 'already running' };

      const port = 10000 + videoManagers.size;
      const vm = new VideoManager(port);
      const recordingPath = path.join(app.getPath('userData'), `camera_${Date.now()}.mp4`);

      await vm.startCamera(devicePath, recordingPath);
      videoManagers.set(id, vm);
      return { ok: true, wsUrl: `ws://localhost:${port}` };
    } catch (e) {
      console.error(e);
      throw e;
    }
  });

  ipcMain.handle('start-rtsp', async (_event, url: string) => {
    try {
      const id = `rtsp_${url}`;
      if (videoManagers.has(id)) return { ok: false, message: 'already running' };

      const port = 10000 + videoManagers.size;
      const vm = new VideoManager(port);
      const recordingPath = path.join(app.getPath('userData'), `rtsp_${Date.now()}.mp4`);

      await vm.startRTSP(url, recordingPath);
      videoManagers.set(id, vm);
      return { ok: true, wsUrl: `ws://localhost:${port}` };
    } catch (e) {
      console.error(e);
      throw e;
    }
  });

  ipcMain.handle('stop-video', async (_event, id: string) => {
    const vm = videoManagers.get(id);
    if (vm) {
      vm.stopAll();
      vm.stopServer();
      videoManagers.delete(id);
    }
    return { ok: true };
  });

  // Provide pglite assets to renderer via IPC (renderer can't read node files)
  ipcMain.handle('get-pglite-asset', async (_event, name: string) => {
    const candidates = [
      // Dev / tests: node_modules copy
      path.resolve(process.cwd(), 'node_modules', '@electric-sql', 'pglite', 'dist', name),
      // Built renderer next to main bundle: ../renderer/<name> (matches createWindow loadFile)
      path.join(__dirname, '..', 'renderer', MAIN_WINDOW_VITE_NAME, name),
      path.join(__dirname, 'assets', name),
      // Built renderer assets folder
      path.join(__dirname, '..', 'renderer', MAIN_WINDOW_VITE_NAME, 'assets', name),
      // Fallback: renderer root next to main
      path.join(__dirname, '..', 'renderer', name),
      // Packaged app resources
      path.join(process.resourcesPath, 'renderer', MAIN_WINDOW_VITE_NAME, name),
      path.join(process.resourcesPath, 'app', 'renderer', MAIN_WINDOW_VITE_NAME, name),
      path.join(process.resourcesPath, name),
    ];

    for (const p of candidates) {
      try {
        const data = await fs.readFile(p);
        return data.toString('base64');
      } catch (_e) {
        // try next
      }
    }

    const err = new Error(`pglite asset not found (tried ${candidates.join(', ')})`);
    console.error('Error reading pglite asset', name, err);
    throw err;
  });
};

const createWindow = () => {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      devTools: true
    },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
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
  mainWindow.webContents.openDevTools();
};

const setupAppMenu = () => {
  const isMac = process.platform === 'darwin';
  const template: any[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Setup Wizard',
          click: () => {
            if (mainWindow) mainWindow.webContents.send('open-setup-wizard');
          }
        },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    }
  ];

  if (isMac) {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template as any);
  Menu.setApplicationMenu(menu);
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.on('ready', () => {
  loadSystemSettings();
  setupIpcHandlers();
  createWindow();
  setupAppMenu();
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
