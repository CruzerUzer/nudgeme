import type { DataStore } from "./store";
import { LocalStore } from "./local";
import { LocalServerStore } from "./localServer";
import { SupabaseStore, createSupabaseClient } from "./supabase";

// Väljer datakälla i prioritetsordning:
//   1. VITE_API_URL satt  -> LocalServerStore (egen server + inloggning)
//   2. Supabase-nycklar   -> SupabaseStore (om ej VITE_DATA_SOURCE=local)
//   3. annars             -> LocalStore (localStorage, kör utan backend)

let store: DataStore | null = null;

export function isServerMode(): boolean {
  return !!import.meta.env.VITE_API_URL;
}

export function getStore(): DataStore {
  if (store) return store;
  if (isServerMode()) {
    store = new LocalServerStore();
    return store;
  }
  const forceLocal = import.meta.env.VITE_DATA_SOURCE === "local";
  const sb = forceLocal ? null : createSupabaseClient();
  store = sb ? new SupabaseStore(sb) : new LocalStore();
  return store;
}

export function isLocalMode(): boolean {
  if (isServerMode()) return false;
  const forceLocal = import.meta.env.VITE_DATA_SOURCE === "local";
  return forceLocal || !createSupabaseClient();
}

export type { DataStore } from "./store";
