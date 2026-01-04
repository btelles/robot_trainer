import { create } from "zustand";
import { configResource } from "../db/resources";

type JSONObject = { [k: string]: any };

type UIState = {
    currentPage: string;
    setCurrentPage: (p: string) => void;
    resourceManagerShowForm: boolean;
    setResourceManagerShowForm: (v: boolean) => void;
    showSetupWizard: boolean;
    setShowSetupWizard: (v: boolean) => void;
    // when true the setup wizard was explicitly opened (e.g. via menu)
    // and should not be auto-closed by background checks
    showSetupWizardForced: boolean;
    setShowSetupWizardForced: (v: boolean) => void;
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
    showSetupWizard: false,
    setShowSetupWizard: (v: boolean) => set(() => ({ showSetupWizard: v })),
    showSetupWizardForced: false,
    setShowSetupWizardForced: (v: boolean) => set(() => ({ showSetupWizardForced: v })),
    config: {},
    setConfig: (cfg: JSONObject) => set(() => ({ config: cfg })),
    setConfigLocal: (cfg: JSONObject) => set(() => ({ config: cfg })),
}));

export default useUIStore;

// persist uiStore.config -> user_config.config.uiStore
let suppressPersist = false;

// on store config changes, persist to DB unless suppressed
useUIStore.subscribe((s) => s.config, async (cfg, prev) => {
    if (suppressPersist) return;
    try {
        await configResource.setKey('uiStore', cfg);
    } catch (e) {
        // ignore persistence errors
    }
});

// load initial uiStore from DB
(async () => {
    try {
        const stored = await configResource.getKey('uiStore');
        if (stored && typeof stored === 'object') {
            suppressPersist = true;
            useUIStore.getState().setConfigLocal(stored);
            // release suppression on next tick
            setTimeout(() => { suppressPersist = false; }, 0);
        }
    } catch (e) {
        // ignore
    }
})();
