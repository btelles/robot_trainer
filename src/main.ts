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
      ipcMain.once('reply-load-system-settings', (_ev, payload) => {
        resolve(payload || {});
      });
    });

    systemSettings = data || {};
  } catch (e) {
    throw("Could not load the system data from the renderer's IndexedDb.")
  }
};

// Resolve a usable `conda` executable path. Returns an absolute path, 'conda' if
// available on PATH, or null if none found.
const resolveCondaExecutable = async (): Promise<string | null> => {
  // 1) If the user has configured a condaRoot in systemSettings, prefer that.
  if (systemSettings && systemSettings.condaRoot) {
    const candidate = path.join(systemSettings.condaRoot, process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'conda.exe' : 'conda');
    try {
      const st = await fs.stat(candidate as any);
      if (st.isFile()) return candidate;
    } catch (e) {
      // ignore
    }
  }

  // 2) Check for a Miniconda we manage under app userData
  try {
    const userDataPath = app.getPath('userData');
    const candidate = path.join(userDataPath, 'miniconda3', 'bin', 'conda');
    const st = await fs.stat(candidate as any);
    if (st.isFile()) return candidate;
  } catch (e) {
    // ignore
  }

  // 3) Check common home locations for conda installer directories
  try {
    const home = app.getPath('home') || os.homedir();
    const common = [
      path.join(home, 'miniconda3', 'bin', 'conda'),
      path.join(home, 'anaconda3', 'bin', 'conda'),
      '/opt/miniconda3/bin/conda',
      '/opt/anaconda3/bin/conda'
    ];
    for (const c of common) {
      try {
        const st = await fs.stat(c as any);
        if (st.isFile()) return c;
      } catch (e) {
        // ignore
      }
    }
  } catch (e) {
    // ignore
  }

  // 4) Finally, check if `conda` is available on PATH
  try {
    const { spawnSync } = await import('node:child_process');
    const result = spawnSync('conda', ['--version'], { encoding: 'utf8' });
    if (result && result.status === 0) return 'conda';
  } catch (e) {
    // not available
  }

  return null;
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
          let done = false
          const to = setTimeout(() => {
            if (done) return;
            done = true;
            clearTimeout(to);
            resolve({ success: false, error: 'renderer timeout' });
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

      // No mainWindow – cannot persist settings without renderer
      return { success: false, error: 'no main window to persist settings' };
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

      // Determine conda executable using shared helper
      const condaExec: string | null = await resolveCondaExecutable();

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
            const child_lerobot_install = spawn(condaExec, ['run', '-n', 'robot_trainer', 'python', '-m', 'pip', 'install', 'lerobot[all]'], { stdio: ['ignore', 'pipe', 'pipe'] });
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
        // Install the full set of extras to ensure optional packages are present
        const child = spawn(pythonPath, ['-m', 'pip', 'install', 'lerobot[all]'], { stdio: ['ignore', 'pipe', 'pipe'] });
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

      // extras we expect to be present (declared by lerobot metadata)
      const extras = [
        'dynamixel','gamepad','hopejr','lekiwi','reachy2','kinematics','intelrealsense',
        'smolvla','xvla','hilserl','async','dev','test','video_benchmark','aloha',
        'pusht','phone','libero','metaworld','sarm'
      ];

      // Build a small Python check script that inspects lerobot's distribution metadata
      const checkScript = [
        "import json,sys",
        "try:",
        "  import importlib.metadata as md",
        "except Exception:",
        "  try:",
        "    import importlib_metadata as md",
        "  except Exception as e:",
        "    print(json.dumps({'ok':False,'error':str(e)}))",
        "    sys.exit(1)",
        "try:",
        "  dist = md.distribution('lerobot')",
        "  declared = dist.metadata.get_all('Provides-Extra') or []",
        `  missing = [e for e in ${JSON.stringify(extras)} if e not in declared]`,
        "  res={'ok': len(missing)==0, 'missing': missing, 'error': None}",
        "except Exception as e:",
        "  res={'ok':False,'missing':[], 'error': str(e)}",
        "print(json.dumps(res))",
        "sys.exit(0 if res['ok'] and not res['error'] else 1)"
      ].join('; ');

      // Prefer conda run if available (ensures correct env activation)
      const condaExec: string | null = await resolveCondaExecutable();

      const runCheck = (cmd: string, args: string[]) => {
        return new Promise<any>((resolve) => {
          const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: false });
          let out = '';
          let err = '';
          if (child.stdout) child.stdout.on('data', (d: any) => out += d.toString());
          if (child.stderr) child.stderr.on('data', (d: any) => err += d.toString());
          child.on('close', (code) => {
            try {
              const parsed = JSON.parse(out || '{}');
              resolve({ installed: Boolean(parsed.ok), missing: parsed.missing || [], output: out + err, error: parsed.error || (code === 0 ? null : `exit:${code}`) });
            } catch (e) {
              resolve({ installed: code === 0, missing: [], output: out + err, error: String(e) });
            }
          });
          child.on('error', () => resolve({ installed: false, missing: [], output: err }));
        });
      };

      if (condaExec) {
        return await runCheck(condaExec, ['run', '-n', 'robot_trainer', 'python', '-c', checkScript]);
      }

      // Fallback: directly call env python if known
      let pythonPath = systemSettings.pythonPath;
      if (!pythonPath) {
        const userDataPath = app.getPath('userData');
        const envPath = path.join(userDataPath, 'miniconda3', 'envs', 'robot_trainer');
        pythonPath = process.platform === 'win32' ? path.join(envPath, 'python.exe') : path.join(envPath, 'bin', 'python');
      }

      return await runCheck(pythonPath, ['-c', checkScript]);
    } catch (e) {
      return { installed: false, missing: [], error: String(e) };
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

      // Allow helper to short-circuit candidate selection when possible
      let chosen: string | null = null;
      const helperConda = await resolveCondaExecutable();
      if (helperConda) {
        chosen = helperConda;
      } else {
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
      }

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
  ipcMain.handle('start-simulation', async (_event, config: any = {}) => {
    try {
      const id = 'simulation';
      if (videoManagers.has(id)) {
        return { ok: false, message: 'simulation already running' };
      }
      // Build command/args based on user's system settings and provided config
      // Prefer conda run -n robot_trainer if we have conda available
      const condaExec: string | null = await resolveCondaExecutable();

      // Build module args from config (use sensible defaults)
      const moduleArgs: string[] = [];
      if (config && typeof config === 'object') {
        if (config.repo_id) { moduleArgs.push('--repo-id', String(config.repo_id)); }
        if (config.policy_type) { moduleArgs.push('--policy-type', String(config.policy_type)); }
        if (config.num_episodes) { moduleArgs.push('--episodes', String(config.num_episodes)); }
        if (config.fps) { moduleArgs.push('--fps', String(config.fps)); }
      }

      let command = 'python3';
      let args: string[] = ['-m', 'lerobot.rl.gym_manipulator', ...moduleArgs];

      if (condaExec) {
        // Use conda run to ensure correct env activation
        command = condaExec;
        args = ['run', '-n', 'robot_trainer', 'python', '-m', 'lerobot.rl.gym_manipulator', ...moduleArgs];
      } else if (systemSettings && systemSettings.pythonPath) {
        command = systemSettings.pythonPath;
        args = ['-m', 'lerobot.rl.gym_manipulator', ...moduleArgs];
      }

      const vm = new VideoManager(9999);
      const recordingPath = path.join(app.getPath('userData'), `simulation_${Date.now()}.mp4`);

      await vm.startSimulation(command, args, recordingPath);
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
  // mainWindow.webContents.openDevTools();
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
