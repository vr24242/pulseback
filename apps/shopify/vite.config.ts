import { defineConfig } from "vite";
import { vitePlugin as remix } from "@remix-run/dev";
import basicSsl from "@vitejs/plugin-basic-ssl";

export default defineConfig({
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*"],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
      },
    }),
    basicSsl(),
  ],
  build: {
    assetsInlineLimit: 0,
  },
  server: {
    port: 3000,
    https: true,
    hmr: {
      protocol: "wss",
      host: "localhost",
      port: 64999,
    },
  },
});
