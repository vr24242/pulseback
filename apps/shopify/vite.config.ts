import { defineConfig } from "vite";
import { vitePlugin as remix } from "@remix-run/dev";
import basicSsl from "@vitejs/plugin-basic-ssl";
import path from "path";

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
  resolve: {
    alias: {
      "~": path.resolve(__dirname, "./app"),
    },
  },
  build: {
    assetsInlineLimit: 0,
    rollupOptions: {
      external: ["bullmq", "ioredis", "worker_threads", "resend"],
    },
  },
  optimizeDeps: {
    exclude: ["bullmq", "ioredis"],
  },
  server: {
    port: 3000,
    https: {},
    hmr: {
      protocol: "wss",
      host: "localhost",
      port: 64999,
    },
  },
});
