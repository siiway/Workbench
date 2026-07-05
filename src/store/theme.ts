/**
 * Theme mode store. Persists explicit light/dark choices to localStorage;
 * "system" is represented by the absence of the key so fresh users follow OS.
 */

import { create } from "zustand";

export type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "prism_theme_mode";

function readInitial(): ThemeMode {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // localStorage may be blocked
  }
  return "system";
}

type ThemeState = {
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
};

export const useThemeStore = create<ThemeState>((set) => ({
  mode: readInitial(),
  setMode: (mode) => {
    set({ mode });
    try {
      if (mode === "system") {
        localStorage.removeItem(STORAGE_KEY);
      } else {
        localStorage.setItem(STORAGE_KEY, mode);
      }
    } catch {
      // localStorage may be blocked
    }
  },
}));

/**
 * Resolve the effective dark-mode boolean from the store's mode
 * and the current OS preference.
 */
export function resolveDark(mode: ThemeMode): boolean {
  if (mode === "light") return false;
  if (mode === "dark") return true;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
