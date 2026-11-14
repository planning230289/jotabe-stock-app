/* 1. CONFIGURACION DE CACHE DEL SERVICE WORKER */
const CACHE_NAME = "jotabe-stock-v4";
const ASSETS_TO_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png"
];

/* Tiempo maximo de espera por red antes de usar cache (evita "cargando..." infinito en celular) */
const NETWORK_TIMEOUT_MS = 8000;

function fetchWithTimeout(request) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("network-timeout")), NETWORK_TIMEOUT_MS);
    fetch(request)
      .then((response) => {
        clearTimeout(timer);
        resolve(response);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

/* 2. INSTALACION: GUARDA LA INTERFAZ EN EL CELULAR (SIN stock_data.js PARA NO FALLAR EN GITHUB PAGES) */
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {
        return Promise.all(
          ASSETS_TO_CACHE.map((url) =>
            fetch(url)
              .then((resp) => {
                if (resp && resp.status === 200) return cache.put(url, resp.clone());
              })
              .catch(() => {})
          )
        );
      });
    })
  );
  self.skipWaiting();
});

/* 3. ACTIVACION: LIMPIA VERSIONES VIEJAS DE CACHE */
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* 4. INTERCEPCION DE RED: NETWORK-FIRST CON TIMEOUT Y RESPALDO OFFLINE */
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const url = new URL(event.request.url);

  // 4a. No interceptar peticiones cross-origin (ej: https://api.github.com/...)
  if (url.origin !== self.location.origin) {
    return;
  }

  // 4b. Endpoints de datos (/api/, stock_data.json, stock_data.js): Network-First con fallback a cache
  if (
    url.pathname.includes("/api/") ||
    url.pathname.endsWith("stock_data.json") ||
    url.pathname.endsWith("stock_data.js")
  ) {
    event.respondWith(
      fetchWithTimeout(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone).catch(() => {});
            });
          }
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            if (url.pathname.endsWith("stock_data.js")) {
              return new Response("", {
                status: 200,
                headers: { "Content-Type": "application/javascript; charset=utf-8" }
              });
            }
            return new Response(JSON.stringify({ error: "offline" }), {
              status: 503,
              headers: { "Content-Type": "application/json; charset=utf-8" }
            });
          });
        })
    );
    return;
  }

  // 4c. Navegacion principal: Network-First con fallback a ./index.html o ./
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetchWithTimeout(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put("./index.html", responseClone).catch(() => {});
            });
          }
          return networkResponse;
        })
        .catch(async () => {
          return (
            (await caches.match(event.request)) ||
            (await caches.match("./index.html")) ||
            (await caches.match("./"))
          );
        })
    );
    return;
  }

  // 4d. Recursos estaticos del mismo origen: Network-First con fallback a cache
  event.respondWith(
    fetchWithTimeout(event.request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone).catch(() => {});
          });
        }
        return networkResponse;
      })
      .catch(async () => {
        return (
          (await caches.match(event.request)) ||
          (await caches.match("./index.html")) ||
          (await caches.match("./"))
        );
      })
  );
});
