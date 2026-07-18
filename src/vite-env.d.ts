/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Adress till den lokala servern. Satt => inloggning + SQLite-backend. */
  readonly VITE_API_URL?: string;
  /** VAPID publik nyckel för web push (valfritt). */
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
