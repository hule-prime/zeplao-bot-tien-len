self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || payload.title || 'Zeplao';
  const body = notification.body || payload.body || 'New message';
  const conversationId = data.conversationId || payload.conversationId || '';
  const messageId = data.messageId || payload.messageId || '';

  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: '/vite.svg',
    badge: '/vite.svg',
    data: { conversationId, messageId },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const conversationId = event.notification.data?.conversationId || '';
  const url = conversationId ? `/?conversation=${encodeURIComponent(conversationId)}` : '/';

  event.waitUntil((async () => {
    const windows = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => 'focus' in client);
    if (existing) {
      await existing.focus();
      existing.postMessage({ type: 'ZEPLAO_OPEN_CONVERSATION', conversationId });
      return;
    }

    await clients.openWindow(url);
  })());
});
