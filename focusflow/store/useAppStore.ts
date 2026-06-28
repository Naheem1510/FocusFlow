import { create } from "zustand";

export type SurfaceScreen =
  | "dashboard"
  | "notes"
  | "tasks"
  | "calendar"
  | "focus"
  | "habits"
  | "settings"
  | "support";

export type ActiveScreen = SurfaceScreen | "vault";

interface AppState {
  /** Whether the covert Vault layer is currently active. In-memory only. */
  isVaultActive: boolean;
  /** The currently visible surface screen (preserved while in the Vault). */
  activeScreen: SurfaceScreen;
  /** The last surface screen — where Panic Exit returns the user. */
  lastSurfaceScreen: SurfaceScreen;

  enterVault: () => void;
  exitVault: () => void;
  setScreen: (screen: SurfaceScreen) => void;
}

/**
 * Global app state. Deliberately uses NO persist middleware — the Vault
 * session exists only in memory, so a refresh always returns to the Surface.
 */
export const useAppStore = create<AppState>((set, get) => ({
  isVaultActive: false,
  activeScreen: "dashboard",
  lastSurfaceScreen: "dashboard",

  enterVault: () =>
    set((s) => ({
      isVaultActive: true,
      lastSurfaceScreen: s.activeScreen,
    })),

  // Panic Exit: instant hard-cut back to the last productivity screen.
  exitVault: () =>
    set((s) => ({
      isVaultActive: false,
      activeScreen: s.lastSurfaceScreen,
    })),

  setScreen: (screen) => {
    // Selecting a surface screen also drops out of the Vault.
    set({ activeScreen: screen, isVaultActive: false });
    void get;
  },
}));
