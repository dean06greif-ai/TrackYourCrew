// Vite statt Create React App (BACKLOG W3, 2026-11-25): schneller, aktiv gepflegt.
// - Umgebungsvariablen behalten ihren Namen REACT_APP_… (Render, .env, start-local.bat bleiben gleich),
//   im Code: import.meta.env.REACT_APP_BACKEND_URL.
// - Port aus PORT (start-local.bat: 3000, Testmodus: 3055), Ausgabe weiter nach build/ (render.yaml).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  envPrefix: ["REACT_APP_", "VITE_"],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: {
    port: Number(process.env.PORT) || 3000,
    strictPort: true,
    host: true, // wie bisher auch im WLAN erreichbar (Handy-Test)
    open: false,
  },
  preview: {
    port: Number(process.env.PORT) || 3000,
  },
  build: {
    outDir: "build",
    emptyOutDir: true,
    sourcemap: false,
    // Große, selten geänderte Bibliotheken getrennt: bleiben nach Updates im Browser-Cache
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          motion: ["framer-motion"],
          icons: ["@phosphor-icons/react"],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: "node", // reine Funktionen, kein Browser nötig (schneller)
    globals: true,
    include: ["src/**/*.test.{js,jsx}"],
  },
});
