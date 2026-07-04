import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = `http://127.0.0.1:${process.env.PORT ?? 8462}`;

// The backend serves the built frontend same-origin in production (no CORS).
// In dev, Vite proxies the REST API and the Socket.IO endpoint to the backend
// so the browser still only ever talks to one origin.
export default defineConfig({
  root: ".",
  publicDir: "public",
  plugins: [react()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: apiTarget, changeOrigin: true },
      // Socket.IO (realtime gameplay, chat, WebRTC signalling). ws:true upgrades.
      "/socket.io": { target: apiTarget, ws: true, changeOrigin: true },
    },
  },
});
