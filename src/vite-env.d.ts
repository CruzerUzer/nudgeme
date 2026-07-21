/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** Absolut adress till den lokala servern (för separat värd). */
  readonly VITE_API_URL?: string;
  /** "1" => server-läge mot /api på samma origin (via Vite-proxy). */
  readonly VITE_SERVER_MODE?: string;
  /** "1" => testbygge (distinkt namn/ikon + TEST-vattenstämpel). */
  readonly VITE_TEST_BUILD?: string;
  /** VAPID publik nyckel för web push (valfritt). */
  readonly VITE_VAPID_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
