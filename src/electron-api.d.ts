interface SerialPort {
  path: string;
  manufacturer: string;
  serialNumber: string;
  productId?: string;
  vendorId?: string;
  pnpId?: string;
}

interface ElectronAPI {
  scanSerialPorts: () => Promise<SerialPort[]>;
  getMigrations: () => JSON;
  saveSystemSettings: (settings: any) => Promise<void>;
  loadSystemSettings: () => Promise<any>;
  listPythonPlugins: (options?: {
    pythonPath?: string;
    robots?: string[];
    teleops?: string[];
  }) => Promise<any>;
  checkAnaconda: () => Promise<{
    found: boolean;
    path: string | null;
    envs: Array<{ name: string; pythonPath?: string | null }>;
    platform?: string;
    condaAvailable?: boolean;
    condaVersion?: string;
    error?: string;
  }>;
  createAnacondaEnv: (
    name: string
  ) => Promise<{ success: boolean; code: number; output: string }>;
  installMiniconda: () => Promise<{ success: boolean; path?: string; error?: string }>;
  installLerobot: () => Promise<{ success: boolean; output?: string; error?: string }>;
  checkLerobot: () => Promise<{ installed: boolean }>;
  saveRobotConfig: (config: any) => Promise<{ ok: boolean; path?: string }>;
  setConfig: (config: any) => Promise<{ ok: boolean; path?: string }>;
  startSimulation: () => Promise<{ ok: boolean; wsUrl?: string; message?: string }>;
  stopSimulation: () => Promise<{ ok: boolean; message?: string }>;
  startCamera: (devicePath: string) => Promise<{ ok: boolean; wsUrl?: string; message?: string }>;
  startRTSP: (url: string) => Promise<{ ok: boolean; wsUrl?: string; message?: string }>;
  stopVideo: (id: string) => Promise<{ ok: boolean; message?: string }>;
  // Main -> Renderer request/listen/reply helpers
  onRequestLoadSystemSettings: (cb: () => void) => () => void;
  onRequestSaveSystemSettings: (cb: (settings: any) => void) => () => void;
  replyLoadSystemSettings: (settings: any) => void;
  replySaveSystemSettings: (result: any) => void;
  onSystemSettingsChanged: (cb: (data: any) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
