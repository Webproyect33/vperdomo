/* ============================================================
   Service Worker — Viajes Perdomo PWA
   Versión con actualización automática

   ⚠️ IMPORTANTE: Cada vez que subas cambios importantes al sitio,
   cambia el número de CACHE_VERSION (v1 → v2 → v3...).
   Esto fuerza la actualización en todos los navegadores.
   ============================================================ */

const CACHE_VERSION = "v2"; // ← Cambia este número al subir cambios
const CACHE_NAME = "viajes-perdomo-" + CACHE_VERSION;

// Archivos que se cachean al instalar (el "shell" de la app)
const ARCHIVOS_CACHE = [
  "./",
  "./index.html",
  "./manifest.json",
  "./datos.json",
  "./icon-192.png",
  "./icon-512.png"
];

/* ============================================================
   INSTALL — Precarga el shell y activa el nuevo SW de inmediato
   ============================================================ */
self.addEventListener("install", event => {
  console.log("📦 [SW] Instalando versión:", CACHE_VERSION);

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log("📦 [SW] Precacheando archivos del shell");
        // addAll falla si algún archivo no existe. Usamos Promise.allSettled
        // para que si falla uno (ej. un icono), no rompa toda la instalación.
        return Promise.allSettled(
          ARCHIVOS_CACHE.map(url =>
            cache.add(url).catch(err => {
              console.warn("⚠️ [SW] No se pudo cachear:", url, err);
            })
          )
        );
      })
      .then(() => {
        // Fuerza a que el nuevo SW se active inmediatamente,
        // sin esperar a que el usuario cierre todas las pestañas.
        console.log("⚡ [SW] skipWaiting() — Activando nueva versión");
        return self.skipWaiting();
      })
      .catch(err => {
        console.error("❌ [SW] Error en install:", err);
      })
  );
});

/* ============================================================
   ACTIVATE — Limpia cachés antiguas y toma el control
   ============================================================ */
self.addEventListener("activate", event => {
  console.log("🔄 [SW] Activando versión:", CACHE_VERSION);

  event.waitUntil(
    caches.keys()
      .then(keys => {
        return Promise.all(
          keys.map(key => {
            // Borra todas las cachés que NO sean la versión actual
            if(key !== CACHE_NAME){
              console.log("🧹 [SW] Eliminando caché antigua:", key);
              return caches.delete(key);
            }
          });
        );
      })
      .then(() => {
        // Toma el control de todas las pestañas abiertas inmediatamente
        console.log("👑 [SW] clients.claim() — Tomando control");
        return self.clients.claim();
      })
      .then(() => {
        // Avisa a todos los clientes (pestañas) que hay nueva versión
        return self.clients.matchAll({ type: "window" }).then(clients => {
          clients.forEach(client => {
            client.postMessage({
              tipo: "SW_ACTUALIZADO",
              version: CACHE_VERSION
            });
          });
        });
      })
      .catch(err => {
        console.error("❌ [SW] Error en activate:", err);
      })
  );
});

/* ============================================================
   FETCH — Estrategias de caché según el tipo de archivo
   ============================================================ */
self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);

  // No interceptar peticiones a otros dominios (WhatsApp, GitHub API, etc.)
  if(url.origin !== self.location.origin) return;

  // No interceptar peticiones que no sean GET
  if(event.request.method !== "GET") return;

  /* ---------- datos.json → RED PRIMERO, caché como respaldo ---------- */
  // Siempre intenta traer los datos más recientes. Si falla (offline),
  // usa la copia cacheada.
  if(url.pathname.endsWith("/datos.json")){
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          if(resp && resp.status === 200){
            const copia = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, copia));
          }
          return resp;
        })
        .catch(() => {
          console.log("📴 [SW] Offline — usando datos.json de caché");
          return caches.match(event.request);
        })
    );
    return;
  }

  /* ---------- index.html y navegación → RED PRIMERO ---------- */
  // Para que siempre tengas la última versión del HTML.
  // Si falla, usa la caché.
  if(event.request.mode === "navigate" || url.pathname.endsWith("/index.html") || url.pathname.endsWith("/admin.html")){
    event.respondWith(
      fetch(event.request)
        .then(resp => {
          if(resp && resp.status === 200){
            const copia = resp.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, copia));
          }
          return resp;
        })
        .catch(() => {
          console.log("📴 [SW] Offline — usando HTML de caché");
          return caches.match(event.request).then(resp => {
            return resp || caches.match("./index.html");
          });
        })
    );
    return;
  }

  /* ---------- Resto de archivos → CACHÉ PRIMERO, red como respaldo ---------- */
  // Imágenes, iconos, manifest, etc. Se sirven desde caché para que
  // carguen instantáneo. Si no está en caché, se descarga y se guarda.
  event.respondWith(
    caches.match(event.request)
      .then(resp => {
        if(resp){
          // Devolver desde caché
          return resp;
        }
        // No está en caché → descargar de la red
        return fetch(event.request)
          .then(respuesta => {
            // Guardar en caché si es una respuesta válida
            if(respuesta && respuesta.status === 200 && respuesta.type === "basic"){
              const copia = respuesta.clone();
              caches.open(CACHE_NAME).then(c => c.put(event.request, copia));
            }
            return respuesta;
          })
          .catch(() => {
            console.log("📴 [SW] Offline — recurso no disponible:", event.request.url);
          });
      })
  );
});

/* ============================================================
   MESSAGE — Permite forzar la actualización desde la página
   ============================================================ */
// Si desde el index.html envías un mensaje con {tipo: "SKIP_WAITING"},
// el SW se activa inmediatamente.
self.addEventListener("message", event => {
  if(event.data && event.data.tipo === "SKIP_WAITING"){
    console.log("⚡ [SW] Recibido SKIP_WAITING — Activando");
    self.skipWaiting();
  }
});