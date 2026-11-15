/* ============================================================
   Xizmat ishchisi (service worker) — FAQAT push-bildirishnoma.
   Sahifalarni keshlamaydi (fetch'ga aralashmaydi) — sayt avvalgidek
   yangilanadi. Ustoz/admin e'loni kelsa, bildirishnoma ko'rsatadi;
   bosilsa sayt ochiladi va chat oynasi chiqadi.
   Server: _worker.js dagi /api/c/push-yubor (shifrlangan, RFC 8291).
   ============================================================ */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let m = null;
    try { m = e.data ? e.data.json() : null; } catch (x) {}
    if (!m) {                                    // shifrsiz/bo'sh push — oxirgi e'lonni so'raymiz
      try {
        const d = await (await fetch('/api/c/elon-oxirgi', { cache: 'no-store' })).json();
        if (d.elon) m = { sarlavha: '📢 ' + d.elon.ism, matn: d.elon.matn, id: d.elon.id };
      } catch (x) {}
    }
    m = m || { sarlavha: '📢 Yangi e’lon', matn: 'Chatda yangi e’lon bor' };
    await self.registration.showNotification(m.sarlavha, {
      body: m.matn, tag: 'elon-' + (m.id || Date.now()), icon: '/logo.png', badge: '/logo.png',
      data: { url: m.url || '/index.html?chat=1' }
    });
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || '/index.html?chat=1';
  e.waitUntil((async () => {
    const oynalar = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of oynalar) {                   // sayt ochiq bo'lsa — o'sha oynada (chat — qayta yuklamasdan)
      if (!('focus' in c)) continue;
      await c.focus();
      if (/chat=1/.test(url)) { c.postMessage({ chat: true }); return; }
      if ('navigate' in c) { try { await c.navigate(url); return; } catch (x) {} }
      break;
    }
    return self.clients.openWindow(url);
  })());
});
