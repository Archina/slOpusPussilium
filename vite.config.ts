import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Subpath deployments (e.g. GitHub Pages at /<repo>/) set BASE_PATH.
// "/" keeps the local dev server and preview unchanged.
const rawBase = process.env.BASE_PATH || "/";
const base = `${rawBase.startsWith("/") ? rawBase : `/${rawBase}`}`.replace(/\/+$/, "/");

export default defineConfig({
  base,
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
  },
});
