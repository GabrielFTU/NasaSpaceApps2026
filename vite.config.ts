import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const meteored: Record<string, ProxyOptions> = {
    "/meteored": {
      target: "https://api.meteored.com",
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/meteored/, "/api"),
      headers: env.METEORED_API_KEY ? { "x-api-key": env.METEORED_API_KEY } : {},
    },
    "/gemini": {
      target: "https://generativelanguage.googleapis.com",
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/gemini/, ""),
      headers: env.GEMINI_API_KEY ? { "x-goog-api-key": env.GEMINI_API_KEY } : {},
    },
    
    "/cepea": {
      target: "https://www.cepea.org.br",
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/cepea/, ""),
      headers: { "User-Agent": "Mozilla/5.0 (Semeia)" },
    },
    "/yahoo": {
      target: "https://query1.finance.yahoo.com",
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/yahoo/, ""),
      headers: { "User-Agent": "Mozilla/5.0 (Semeia)" },
    },
  };

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: { proxy: meteored },
    preview: { proxy: meteored },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            react: ["react", "react-dom", "react-router-dom", "zustand"],
            charts: ["recharts"],
            maps: ["leaflet", "react-leaflet"],
          },
        },
      },
    },
  };
});
