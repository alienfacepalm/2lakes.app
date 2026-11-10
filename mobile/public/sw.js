const SHELL_CACHE = "2lakes-shell-v3";
const DATA_CACHE = "2lakes-data-v3";
/** Keep in lockstep with `mobile/src/lib/sync.ts` DEFAULT_API_BASE. */
const API_BASE = "https://2lakes-api.brandon-pliska-86a.workers.dev";
const PERIODIC_SYNC_TAG = "2lakes-sync";
const LAST_SEQ_KEY = "lastSeq";
const LAST_SYNC_KEY = "2lakes-last-sync";
const DB_NAME = "2lakes-history";
const DB_VERSION = 2;
const STORE = "snapshots";
const META_STORE = "meta";
const PAGE_LIMIT = 1000;
const MAX_PAGES = 50;

const PRECACHE = [
  "/",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE && key !== DATA_CACHE)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

function openHistoryDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { autoIncrement: true });
        store.createIndex("by-buoy", "buoyId");
        store.createIndex("by-buoy-timestamp", ["buoyId", "timestamp"], { unique: true });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbGet(db, storeName, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const req = tx.objectStore(storeName).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(db, storeName, value, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const req = key === undefined ? tx.objectStore(storeName).put(value) : tx.objectStore(storeName).put(value, key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getLastSeq(db) {
  return (await idbGet(db, META_STORE, LAST_SEQ_KEY)) || 0;
}

async function setLastSeq(db, seq) {
  await idbPut(db, META_STORE, seq, LAST_SEQ_KEY);
}

async function upsertRows(db, rows) {
  if (!rows.length) return 0;
  let changed = 0;
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    const index = store.index("by-buoy-timestamp");
    let i = 0;

    const next = () => {
      if (i >= rows.length) return;
      const row = rows[i++];
      if (!row || typeof row.buoyId !== "string" || typeof row.timestamp !== "string") {
        next();
        return;
      }
      const keyReq = index.getKey([row.buoyId, row.timestamp]);
      keyReq.onsuccess = () => {
        const key = keyReq.result;
        if (key !== undefined) {
          const getReq = store.get(key);
          getReq.onsuccess = () => {
            const existing = getReq.result;
            if (existing && existing.seq === row.seq && existing.updatedAt === row.updatedAt) {
              next();
              return;
            }
            store.put({ ...row }, key);
            changed++;
            next();
          };
          getReq.onerror = () => reject(getReq.error);
        } else {
          store.add({ ...row });
          changed++;
          next();
        }
      };
      keyReq.onerror = () => reject(keyReq.error);
    };

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    next();
  });
  return changed;
}

async function syncFromWorker() {
  const db = await openHistoryDb();
  let lastSeq = await getLastSeq(db);
  let pages = 0;

  while (pages < MAX_PAGES) {
    const res = await fetch(`${API_BASE}/v1/history?afterSeq=${lastSeq}&limit=${PAGE_LIMIT}`);
    if (!res.ok) throw new Error(`API error ${res.status}`);
    const body = await res.json();
    pages++;

    if (typeof body.maxSeq === "number" && body.maxSeq < lastSeq) {
      lastSeq = 0;
      await setLastSeq(db, 0);
      continue;
    }

    const rows = Array.isArray(body.rows) ? body.rows : [];
    await upsertRows(db, rows);
    if (typeof body.nextSeq === "number" && body.nextSeq > lastSeq) {
      lastSeq = body.nextSeq;
      await setLastSeq(db, lastSeq);
    }
    if (!body.hasMore) break;
    if (rows.length === 0) break;
  }

  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
  } catch {
    /* SW may not share localStorage in every browser; cursor still lives in IndexedDB */
  }

  const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const client of clientsList) {
    client.postMessage({ type: "2lakes-sync-complete", lastSeq });
  }
}

self.addEventListener("periodicsync", (event) => {
  if (event.tag === PERIODIC_SYNC_TAG) {
    event.waitUntil(syncFromWorker().catch(() => undefined));
  }
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "2lakes-sync-now") {
    event.waitUntil(syncFromWorker().catch(() => undefined));
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);

  if (url.origin === self.location.origin) {
    if (url.pathname.startsWith("/assets/")) {
      event.respondWith(
        caches.match(event.request).then(
          (cached) =>
            cached ||
            fetch(event.request).then((response) => {
              if (response.ok) {
                caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, response.clone()));
              }
              return response;
            })
        )
      );
      return;
    }

    if (event.request.mode === "navigate") {
      event.respondWith(
        fetch(event.request)
          .then((response) => {
            if (response.ok) {
              caches.open(SHELL_CACHE).then((cache) => cache.put(event.request, response.clone()));
            }
            return response;
          })
          .catch(() => caches.match("/") || caches.match(event.request))
      );
      return;
    }
  }

  event.respondWith(fetch(event.request));
});
