// Keeps a guest's files in this browser (IndexedDB) so the landing page can
// hand them to the dashboard without a server. Shared by landing.js and
// dashboard.js. When the backend exists, this can be swapped for real uploads.

const DB_NAME = "wreads-local";
const STORE = "files";

function openDB() {
  return new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("This browser can't store files locally."));
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const out = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(out && "result" in out ? out.result : undefined);
    t.onerror = () => reject(t.error);
  });
}

/** Save File objects. Returns the stored records (without blobs). */
export async function saveLocalFiles(files) {
  const db = await openDB();
  const records = [...files].map((f) => ({
    id: `local-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    name: f.name,
    size: f.size,
    type: f.type,
    addedAt: Date.now(),
    blob: f,
  }));
  await tx(db, "readwrite", (s) => records.forEach((r) => s.put(r)));
  return records.map(({ blob, ...meta }) => meta);
}

/** All stored files, newest first (blobs included). */
export async function listLocalFiles() {
  try {
    const db = await openDB();
    const all = await tx(db, "readonly", (s) => s.getAll());
    return (all || []).sort((a, b) => b.addedAt - a.addedAt);
  } catch {
    return [];
  }
}

export async function removeLocalFile(id) {
  try {
    const db = await openDB();
    await tx(db, "readwrite", (s) => s.delete(id));
  } catch {
    /* ignore */
  }
}
