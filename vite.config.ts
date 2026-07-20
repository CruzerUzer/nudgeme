import { defineConfig } from "vitest/config";
import { fileURLToPath, URL } from "node:url";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// NudgeMe är en PWA så att den kan installeras på hemskärmen — vilket krävs
// för web push på iOS (16.4+). Service worker för push registreras separat
// i src/lib/push (injectManifest-strategi vore ett alternativ; här räcker
// den genererade SW:n plus vår egen push-logik i public/sw-push.js).
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png"],
      // Lägg till vår push-/klick-hanterare i den genererade service workern.
      workbox: { importScripts: ["push-handler.js"] },
      manifest: {
        name: "NudgeMe",
        short_name: "NudgeMe",
        description:
          "En snäll app som viskar fram roliga aktiviteter du annars glömmer bort.",
        theme_color: "#334537",
        background_color: "#f4f2ec",
        display: "standalone",
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-512-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: true, // lyssna på alla nätverksgränssnitt (LAN + Tailscale)
    // Tillåt åtkomst via Tailscale MagicDNS-namn (*.ts.net), inte bara IP.
    allowedHosts: [".ts.net"],
    // Proxa /api till den lokala servern. Då pratar klienten med API:t på
    // SAMMA origin som den nådde frontend på (localhost, LAN-IP eller Tailscale)
    // – ingen hårdkodad värd, ingen Tailscale-tvång för LAN-test.
    proxy: {
      "/api": {
        target: process.env.API_PROXY ?? "http://localhost:4303",
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
