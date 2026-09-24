import { useSyncExternalStore } from "react";

export type ThemeMode = "light" | "dark" | "system";

const KEY = "invai.theme";
const listeners = new Set<() => void>();

function read(): ThemeMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {}
  return "system";
}

let current: ThemeMode = typeof window === "undefined" ? "system" : read();

function systemDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function applyTheme(mode: ThemeMode = current) {
  const dark = mode === "dark" || (mode === "system" && systemDark());
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.classList.toggle("light", !dark);
  root.style.colorScheme = dark ? "dark" : "light";
}

export function setTheme(mode: ThemeMode) {
  current = mode;
  try {
    localStorage.setItem(KEY, mode);
  } catch {}
  applyTheme(mode);
  for (const l of listeners) l();
}

export function isDark() {
  return document.documentElement.classList.contains("dark");
}

export function useTheme(): ThemeMode {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export function initTheme() {
  applyTheme();
  window.matchMedia?.("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (current === "system") applyTheme();
  });
}
