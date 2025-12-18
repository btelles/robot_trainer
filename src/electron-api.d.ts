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
  saveSystemSettings: (settings: any) => Promise<void>;
  loadSystemSettings: () => Promise<any>;
  listPythonPlugins: (options?: { pythonPath?: string; robots?: string[]; teleops?: string[] }) => Promise<any>;
  checkAnaconda: () => Promise<{ found: boolean; path: string | null; envs: Array<{ name: string; pythonPath?: string | null }>; platform?: string; condaAvailable?: boolean; condaVersion?: string; error?: string }>;
  createAnacondaEnv: (name: string) => Promise<{ success: boolean; code: number; output: string }>;
  saveRobotConfig: (config: any) => Promise<{ ok: boolean; path?: string }>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
