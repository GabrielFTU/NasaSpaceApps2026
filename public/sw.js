/*
 * Service worker do Semeia.
 *
 * O que funciona sem internet: abrir o app, navegar entre as telas e ver o que está salvo
 * no aparelho (propriedades, talhões, análises — ficam no localStorage/IndexedDB, não aqui).
 *
 * O que NÃO é guardado, de propósito:
 * - dados ambientais (NASA POWER/SMAP/MODIS/GIBS), previsão, cotações e tiles de mapa:
 *   mostrar uma resposta antiga como se fosse atual seria enganoso;
 * - o assistente (/gemini) e qualquer requisição que não seja GET.
 *
 * Atualização: a versão vem na URL de registro (?v=...). Versão nova → cache novo; os antigos são apagados.
 */
const VERSION = new URL(self.location.href).searchParams.get("v") || "dev";
const SHELL = `semeia-shell-${VERSION}`;
const STATIC = `semeia-static-${VERSION}`;
const NEVER = [/^\/gemini\//, /^\/meteored\//, /^\/cepea\//, /^\/yahoo\//];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((c) => c.addAll(["/", "/manifest.webmanifest", "/favicon.svg", "/logo-mark.png", "/icons/icon-192.png"]))
      // código de todas as telas (JS/CSS do build): sem isso, uma tela nunca aberta não abriria off-line.
      // Falha aqui não impede a instalação: o restante entra no cache conforme o uso.
      .then(() =>
        fetch("/asset-list.json")
          .then((r) => (r.ok ? r.json() : []))
          .then((list) => caches.open(STATIC).then((c) => c.addAll(list)))
          .catch(() => {}),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("semeia-") && k !== SHELL && k !== STATIC).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // APIs externas e tiles: sempre da rede
  if (NEVER.some((re) => re.test(url.pathname))) return;

  // Navegação: rede primeiro (versão mais nova); sem internet, o shell guardado (SPA)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (res.ok) caches.open(SHELL).then((c) => c.put("/", copy));
          return res;
        })
        .catch(() => caches.match("/", { cacheName: SHELL })),
    );
    return;
  }

  // Arquivos com hash (/assets/*) nunca mudam: cache primeiro
  if (url.pathname.startsWith("/assets/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(STATIC).then((c) => c.put(req, copy));
            }
            return res;
          }),
      ),
    );
    return;
  }

  // Imagens, ícones e o ZARC pré-processado (dado oficial publicado, não medição do dia):
  // usa o guardado e atualiza em segundo plano
  if (/\.(png|jpg|jpeg|svg|webp|woff2?)$/.test(url.pathname) || url.pathname.startsWith("/zarc/")) {
    event.respondWith(
      caches.open(STATIC).then((c) =>
        c.match(req).then((hit) => {
          const fresh = fetch(req)
            .then((res) => {
              if (res.ok) c.put(req, res.clone());
              return res;
            })
            .catch(() => hit);
          return hit || fresh;
        }),
      ),
    );
  }
});
