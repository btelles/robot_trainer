// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  scanSerialPorts: () => ipcRenderer.invoke('scan-serial-ports'),
  saveSystemSettings: (settings: any) => ipcRenderer.invoke('save-system-settings', settings),
  loadSystemSettings: () => ipcRenderer.invoke('load-system-settings'),
  listPythonPlugins: (options?: { pythonPath?: string; robots?: string[]; teleops?: string[] }) => ipcRenderer.invoke('list-python-plugins', options),
  checkAnaconda: () => ipcRenderer.invoke('check-anaconda'),
  createAnacondaEnv: (name: string) => ipcRenderer.invoke('create-anaconda-env', name),
  saveRobotConfig: (config: any) => ipcRenderer.invoke('save-robot-config', config),
});