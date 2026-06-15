// frontend/vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite replaces Create React App. Key differences handled here:
//   • Dev server runs on a fixed port 3000 (was CRA's PORT env var).
//   • The CRA "proxy" field is replaced by server.proxy below: API calls in
//     development are forwarded to the FastAPI backend on :8000, so there are
//     no CORS issues and the frontend code can use relative URLs.
//   • Production build output goes to "dist/" (CRA used "build/").
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    strictPort: true,   // fail loudly if 3000 is taken instead of silently using another port
    proxy: {
      // Every backend route lives under one of these prefixes.
      "/boards":   "http://localhost:8000",
      "/sessions": "http://localhost:8000",
      "/debug":    "http://localhost:8000",
      "/health":   "http://localhost:8000",
    },
  },
  build: {
    outDir: "dist",
  },
});
