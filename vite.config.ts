import { defineConfig } from "vite";

const apiTarget = `http://127.0.0.1:${process.env.PORT ?? 8462}`;

export default defineConfig({
  root: ".",
  publicDir: "public",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
      // STOMP over WebSocket — proxied to the backend so dev is same-origin.
      "/stomp": { target: apiTarget, ws: true, changeOrigin: true },
    },
  },
});
