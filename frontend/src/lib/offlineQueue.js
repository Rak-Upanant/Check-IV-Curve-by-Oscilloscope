// frontend/src/lib/offlineQueue.js
//
// A tiny offline upload queue backed by IndexedDB (the browser's built-in
// on-disk database). When a collect upload fails because the device is offline,
// we stash the image file + its metadata here. When the connection returns, the
// CollectFlow page drains the queue and uploads everything.
//
// Why IndexedDB and not localStorage: localStorage only stores strings and is
// small (~5 MB). IndexedDB can store binary File/Blob objects directly and is
// much larger — perfect for queuing photos.
//
// This module is deliberately framework-free: a few small promise-wrapped
// functions around the raw IndexedDB API, no external dependency.

const DB_NAME    = "iv-sig-offline";
const STORE_NAME = "uploads";
const DB_VERSION = 1;

// Open (or create) the database. Returns a promise of the IDBDatabase.
function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    // Runs only when the DB is first created or the version changes —
    // this is where we define the object store (like a table).
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        // autoIncrement gives each queued upload a unique numeric id.
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

// Helper: run a transaction on the store and resolve when it completes.
async function withStore(mode, fn) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx    = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    const result = fn(store);
    tx.oncomplete = () => resolve(result);
    tx.onerror    = () => reject(tx.error);
    tx.onabort    = () => reject(tx.error);
  });
}

// Add one upload to the queue. `item` = { sessionId, pointId, serial, file, fileName }.
// The File/Blob is stored as-is (IndexedDB clones it to disk).
export async function enqueue(item) {
  await withStore("readwrite", store => store.add({ ...item, queuedAt: Date.now() }));
}

// Return every queued upload (array of stored records, each including its `id`).
export function getAll() {
  return withStore("readonly", store => {
    const out = [];
    store.openCursor().onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) { out.push(cursor.value); cursor.continue(); }
    };
    return out;   // withStore resolves this once the transaction completes
  });
}

// Remove one upload from the queue by id (after it has uploaded successfully).
export async function remove(id) {
  await withStore("readwrite", store => store.delete(id));
}

// How many uploads are waiting.
export async function count() {
  const all = await getAll();
  return all.length;
}
