// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld("electronAPI", {
  scanSerialPorts: () => ipcRenderer.invoke("scan-serial-ports"),
  saveSystemSettings: (settings: any) =>
    ipcRenderer.invoke("save-system-settings", settings),
  listPythonPlugins: (options?: {
    pythonPath?: string;
    robots?: string[];
    teleops?: string[];
  }) => ipcRenderer.invoke("list-python-plugins", options),
  checkAnaconda: () => ipcRenderer.invoke("check-anaconda"),
  createAnacondaEnv: (name: string) =>
    ipcRenderer.invoke("create-anaconda-env", name),
  installMiniconda: () => ipcRenderer.invoke('install-miniconda'),
  installLerobot: () => ipcRenderer.invoke('install-lerobot'),
  checkLerobot: () => ipcRenderer.invoke('check-lerobot'),
  saveRobotConfig: (config: any) =>
    ipcRenderer.invoke("save-robot-config", config),
  setConfig: (config: any) =>
    ipcRenderer.invoke("save-robot-config", config),
  // Main -> Renderer requests: renderer should listen and reply
  onRequestLoadSystemSettings: (cb: () => void) => {
    const listener = (_: any) => cb();
    ipcRenderer.on('request-load-system-settings', listener);
    return () => ipcRenderer.removeListener('request-load-system-settings', listener);
  },
  onRequestSaveSystemSettings: (cb: (settings: any) => void) => {
    const listener = (_: any, settings: any) => cb(settings);
    ipcRenderer.on('request-save-system-settings', listener);
    return () => ipcRenderer.removeListener('request-save-system-settings', listener);
  },
  // Renderer replies back to main via these helper methods
  replyLoadSystemSettings: (settings: any) => ipcRenderer.send('reply-load-system-settings', settings),
  replySaveSystemSettings: (result: any) => ipcRenderer.send('reply-save-system-settings', result),
  onSystemSettingsChanged: (cb: (data: any) => void) => {
    const listener = (_: any, data: any) => cb(data);
    ipcRenderer.on("system-settings-changed", listener);
    return () =>
      ipcRenderer.removeListener("system-settings-changed", listener);
  },
  onOpenSetupWizard: (cb: () => void) => {
    const listener = (_: any) => cb();
    ipcRenderer.on('open-setup-wizard', listener);
    return () => ipcRenderer.removeListener('open-setup-wizard', listener);
  },
  getMigrations: () => ipcRenderer.invoke('get-migrations')
  ,
  startSimulation: () => ipcRenderer.invoke('start-simulation'),
  stopSimulation: () => ipcRenderer.invoke('stop-simulation'),
  startCamera: (devicePath: string) => ipcRenderer.invoke('start-camera', devicePath),
  startRTSP: (url: string) => ipcRenderer.invoke('start-rtsp', url),
  stopVideo: (id: string) => ipcRenderer.invoke('stop-video', id),
  onSimulationFrame: (cb: (base64jpeg: string) => void) => {
    const listener = (_: any, data: string) => cb(data);
    ipcRenderer.on('simulation-frame', listener);
    return () => ipcRenderer.removeListener('simulation-frame', listener);
  },
  onSimulationStopped: (cb: (info: any) => void) => {
    const listener = (_: any, data: any) => cb(data);
    ipcRenderer.on('simulation-stopped', listener);
    return () => ipcRenderer.removeListener('simulation-stopped', listener);
  }
});