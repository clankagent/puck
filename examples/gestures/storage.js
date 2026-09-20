// The local lab retains its server API. Pages uses browser-only IndexedDB storage.
export const browserStorage = typeof document !== 'undefined' && Boolean(document.querySelector('meta[name="puck-storage"][content="browser"]'));
export async function recordingFetch(path, options = {}) {
  if (!browserStorage) return fetch(path, options);
  const reply = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
  if (path === '/api/session') return reply({ token: 'browser-local' });
  const db = await new Promise((resolve, reject) => {
    const open = indexedDB.open('puck-public-recordings', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('recordings', { keyPath: 'id' });
    open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('recordings', options.method === 'POST' ? 'readwrite' : 'readonly');
      const store = tx.objectStore('recordings'); let value;
      if (options.method === 'POST') {
        const data = JSON.parse(options.body); value = { id: crypto.randomUUID(), savedAt: new Date().toISOString() };
        store.add({ ...data, ...value });
      } else {
        const id = path.slice('/api/recordings/'.length);
        const request = path === '/api/recordings' ? store.getAll() : store.get(id);
        request.onsuccess = () => { value = path === '/api/recordings' ? request.result.map(r => ({ id: r.id, savedAt: r.savedAt, source: r.source, note: r.note, durationMs: r.durationMs, reports: r.timeline.filter(e => e.type === 'input').length, events: r.events.length })).sort((a, b) => b.savedAt.localeCompare(a.savedAt)) : request.result; };
      }
      tx.oncomplete = () => resolve(value === undefined ? new Response('{}', { status: 404 }) : reply(value));
      tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error ?? Error('Browser storage is unavailable. Download a backup.'));
    });
  } finally { db.close(); }
}
