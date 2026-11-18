import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// El panel vive en /admin del Worker. En desarrollo, la API se reenvía a `wrangler dev` (8787).
export default defineConfig({
  base: "/admin/",
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist/admin",
    emptyOutDir: true,
  },
  server: {
    proxy: {
      "/admin/api": "http://localhost:8787",
      "/api": "http://localhost:8787",
      "/widget.js": "http://localhost:8787",
    },
  },
});
