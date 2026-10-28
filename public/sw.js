// Service worker. Sem ele o Android nao oferece "Instalar aplicativo" — o
// navegador exige um manipulador de fetch para tratar o site como aplicativo.
//
// A estrategia e conservadora de proposito: a rede manda sempre. O cache so
// entra quando nao ha internet, para o aplicativo abrir e mostrar "Sem
// internet" em vez de uma tela de erro do navegador. Nada de resposta de
// servidor (as chamadas ao banco) e guardado.

const CACHE = "meuponto.v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      // Uma falha aqui nao pode impedir a instalacao do service worker.
      .then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(new Request(url, { cache: "reload" })))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  // Só GET. Registrar ponto é POST e nunca passa pelo cache.
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Dados do banco e funcoes de servidor: sempre rede, nunca cache.
  if (url.pathname.startsWith("/_server") || url.pathname.startsWith("/api")) return;

  // Navegacao: rede primeiro, cache como ultimo recurso.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("/", copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match("/").then((hit) => hit ?? Response.error())),
    );
    return;
  }

  // Arquivos estaticos: rede primeiro, cache se falhar.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && response.type === "basic") {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request).then((hit) => hit ?? Response.error())),
  );
});
