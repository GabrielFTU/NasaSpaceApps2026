/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Modelo do Gemini usado pelo assistente (opcional; padrão gemini-flash-latest). */
  readonly VITE_GEMINI_MODEL?: string;
}

/** Versão do build (definida em vite.config.ts) — usada para versionar o cache do service worker. */
declare const __APP_VERSION__: string;
