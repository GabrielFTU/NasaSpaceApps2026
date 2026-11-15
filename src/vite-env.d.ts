/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Modelo do Gemini usado pelo assistente (opcional; padrão gemini-flash-latest). */
  readonly VITE_GEMINI_MODEL?: string;
}
