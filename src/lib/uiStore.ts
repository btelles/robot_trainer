import { create } from "zustand";

type UIState = {
  currentPage: string;
  setCurrentPage: (p: string) => void;
  resourceManagerShowForm: boolean;
  setResourceManagerShowForm: (v: boolean) => void;
};

const useUIStore = create<UIState>((set) => ({
  currentPage: "home",
  setCurrentPage: (p: string) => set(() => ({ currentPage: p })),
  resourceManagerShowForm: false,
  setResourceManagerShowForm: (v: boolean) => set(() => ({ resourceManagerShowForm: v })),
}));

export default useUIStore;
