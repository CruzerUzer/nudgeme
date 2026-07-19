import type { DataStore } from "./store";
import { LocalStore } from "./local";
import { LocalServerStore } from "./localServer";

// Väljer datakälla:
//   1. VITE_API_URL satt  -> LocalServerStore (egen server + inloggning)
//   2. annars             -> LocalStore (localStorage, kör utan backend)

let store: DataStore | null = null;

export function isServerMode(): boolean {
  // Server-läge antingen via explicit VITE_SERVER_MODE=1 (då pratar klienten
  // relativt mot /api på samma origin) eller via en absolut VITE_API_URL.
  return (
    import.meta.env.VITE_SERVER_MODE === "1" || !!import.meta.env.VITE_API_URL
  );
}

export function getStore(): DataStore {
  if (store) return store;
  store = isServerMode() ? new LocalServerStore() : new LocalStore();
  return store;
}

export function isLocalMode(): boolean {
  return !isServerMode();
}

export type { DataStore } from "./store";
