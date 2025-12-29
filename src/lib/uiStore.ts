import { create } from "zustand";
import ConfigManager from "./config_manager";

type JSONObject = { [k: string]: any };

type UIState = {
    currentPage: string;
    setCurrentPage: (p: string) => void;
    resourceManagerShowForm: boolean;
    setResourceManagerShowForm: (v: boolean) => void;
    config: JSONObject;
    setConfig: (cfg: JSONObject) => void;
    // update the local store without triggering a save
    setConfigLocal: (cfg: JSONObject) => void;
};

const useUIStore = create<UIState>((set) => ({
    currentPage: "home",
    setCurrentPage: (p: string) => set(() => ({ currentPage: p })),
    resourceManagerShowForm: false,
    setResourceManagerShowForm: (v: boolean) => set(() => ({ resourceManagerShowForm: v })),
    config: {},
    setConfig: (cfg: JSONObject) => set(() => {
        if (typeof window !== 'undefined' && (window as any).electronAPI && (window as any).electronAPI.saveSystemSettings) {
            (window as any).electronAPI.saveSystemSettings(cfg);
        }
        return { config: cfg };
    }),
    setConfigLocal: (cfg: JSONObject) => set(() => ({ config: cfg })),
}));

export default useUIStore;
