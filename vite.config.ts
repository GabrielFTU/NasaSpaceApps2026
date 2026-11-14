import { defineConfig, loadEnv, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig(({ mode }) => {
  // carrega também variáveis SEM prefixo VITE_ — essas ficam só no servidor, nunca vão para o navegador
  const env = loadEnv(mode, process.cwd(), "");

  /**
   * Proxy da Meteored: o navegador chama /meteored/... e o servidor do Vite repassa para
   * https://api.meteored.com/api/... acrescentando o cabeçalho x-api-key.
   * A chave (METEORED_API_KEY em .env.local) não aparece no código do navegador.
   * Em produção este papel passa para a API ASP.NET Core.
   */
  const meteored: Record<string, ProxyOptions> = {
    "/meteored": {
      target: "https://api.meteored.com",
      changeOrigin: true,
      rewrite: (p) => p.replace(/^\/meteored/, "/api"),
      headers: env.METEORED_API_KEY ? { "x-api-key": env.METEORED_API_KEY } : {},
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
