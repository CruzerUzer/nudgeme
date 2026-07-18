import type { DataStore } from "./store";
import { LocalStore } from "./local";
import { SupabaseStore, createSupabaseClient } from "./supabase";

// Väljer datakälla: Supabase om VITE_SUPABASE_* är satta och VITE_DATA_SOURCE
// inte tvingar "local"; annars localStorage. Detta gör att appen kör direkt
// utan backend under utveckling, och blir multi-user så fort man kopplar på
// ett Supabase-projekt.

let store: DataStore | null = null;

export function getStore(): DataStore {
  if (store) return store;
  const forceLocal = import.meta.env.VITE_DATA_SOURCE === "local";
  const sb = forceLocal ? null : createSupabaseClient();
  store = sb ? new SupabaseStore(sb) : new LocalStore();
  return store;
}

export function isLocalMode(): boolean {
  const forceLocal = import.meta.env.VITE_DATA_SOURCE === "local";
  return forceLocal || !createSupabaseClient();
}

export type { DataStore } from "./store";
