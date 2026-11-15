import { useSyncExternalStore } from "react";

/** Registra o service worker só no build de produção (no `vite dev` ele atrapalharia o HMR). */
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register(`/sw.js?v=${__APP_VERSION__}`).catch((e) => console.warn("[PWA] service worker não registrado:", e));
  });
}

const subscribe = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

/** true quando o navegador informa que está sem conexão. */
export const useOffline = () => useSyncExternalStore(subscribe, () => !navigator.onLine, () => false);
