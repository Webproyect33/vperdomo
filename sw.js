/* ============================================================
   Service Worker — Viajes Perdomo PWA
   Estrategia: caché primero para el shell, red primero para datos.json
   ============================================================ */

const CACHE_NAME = "viajes-perdomo-v1";

// Archivos que se cachean al instalar (el "shell" de la app)
const ARCHIVOS_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./datos.json",
  "./icon-192.png",
  "./icon-512.png"
];

// Instalación: precachear el shell
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log("📦 Precacheando archivos del shell");
        return cache.addAll(ARCHIVOS_CACHE);
      })
      .then(() => self.skipWaiting())
      .catch(err => console.warn("⚠️ Error precacheando:", err))
  );
});

// Activación: borrar cachés viejas
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_NAME)
          .map(k => {
            console.log("🧹 Eliminando caché antigua:", k);
            return caches.delete(k);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: estrategia según el tipo de archivo
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // No interceptar peticiones a otros dominios (WhatsApp, etc.)
  if(url.origin !== self.location.origin) return;

  // datos.json → RED primero (para tener siempre lo último), caché como respaldo
  if(url.pathname.endsWith("/datos.json")){
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          // Guardar copia actualizada en caché
          const copia = resp.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copia));
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Resto de archivos → CACHÉ primero, red como respaldo
  event.respondWith(
    caches.match(event.request).then(resp => {
      if(resp) return resp;
      return fetch(event.request).then(respuesta => {
        // Cachear lo que se va descargando (por si acaso)
        if(respuesta && respuesta.status === 200 && respuesta.type === "basic"){
          const copia = respuesta.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, copia));
        }
        return respuesta;
      }).catch(() => {
        // Si falla y es navegación, devolver index.html
        if(event.request.mode === "navigate"){
          return caches.match("./index.html");
        }
      });
    })
  );
});