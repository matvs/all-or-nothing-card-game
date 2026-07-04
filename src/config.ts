/**
 * Same-origin everywhere. In production the Node server serves this bundle and
 * the API from one origin; in dev, Vite proxies /api and /ws to the
 * backend. So the REST base is just "/api" and the WebSocket connects to the
 * current origin — no CORS, ever.
 */
export const API_BASE = "/api";
export const TOKEN_KEY = "aon:player";
