/* global self, clients */
// Push- och notisklick-hantering för NudgeMe. Importeras in i den genererade
// service workern (se vite.config.ts). Tar emot payloaden som Edge Function
// skickar och visar en vänlig notis. Nivåstyrning: `silent` och `vibrate`
// sätts av servern utifrån användarens valda synlighetsnivå.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_e) {
    data = { title: "NudgeMe", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "NudgeMe";
  const options = {
    body: data.body || "En vänlig knuff väntar.",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: "nudgeme-nudge", // ersätter ev. tidigare – aldrig en hög med notiser
    renotify: false,
    silent: data.silent !== false,
    data: { url: "/" },
  };
  if (Array.isArray(data.vibrate)) options.vibrate = data.vibrate;

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const client of list) {
        if ("focus" in client) return client.focus();
      }
      return clients.openWindow(url);
    }),
  );
});
