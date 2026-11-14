// Macht die Sprechtafel offline-fähig: Nach dem ersten Öffnen liegt die Seite
// auf dem Gerät und startet auch ohne Internet (z. B. im Krankenhaus).
// Gilt nur für diesen Ordner, nicht für den Rest der Webseite.
// Nach einer Änderung an index.html: Die neue Fassung wird beim nächsten
// Öffnen mit Internet geholt und ist beim übernächsten Öffnen zu sehen.

const SPEICHER = 'sprechtafel-v1';

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches
      .open(SPEICHER)
      .then((c) => c.addAll(['./', './index.html']))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.open(SPEICHER).then(async (c) => {
      const gespeichert = await c.match(e.request, { ignoreSearch: true });
      // Im Hintergrund die neueste Fassung holen und für das nächste Mal ablegen
      const neu = fetch(e.request)
        .then((antwort) => {
          if (antwort.ok) c.put(e.request, antwort.clone());
          return antwort;
        })
        .catch(() => null);
      // Sofort aus dem Speicher antworten, sonst auf das Netz warten
      return gespeichert || (await neu) || (await c.match('./index.html')) || Response.error();
    })
  );
});
