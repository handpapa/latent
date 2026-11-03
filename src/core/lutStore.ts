/**
 * Imported filter tables live in IndexedDB: a 33³ table is 142 KB of floats,
 * which is the wrong shape for localStorage and the wrong place for the undo
 * document. Colour cards stay in localStorage because they are a few hundred
 * bytes of numbers.
 */
const DB_NAME = 'latent';
const STORE = 'luts';

export interface StoredLut {
  id: string;
  name: string;
  size: number;
  /** RGBA, 0…1, exactly what the GPU is given. */
  data: Float32Array;
}

function open(): Promise<IDBDatabase> {
  const { promise, resolve, reject } = Promise.withResolvers<IDBDatabase>();
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    const db = request.result;
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error ?? new Error('无法打开 IndexedDB'));
  return promise;
}

export async function saveLut(lut: StoredLut): Promise<void> {
  const db = await open();
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).put(lut);
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error ?? new Error('写入 LUT 失败'));
  return promise;
}

export async function deleteLut(id: string): Promise<void> {
  const db = await open();
  const { promise, resolve, reject } = Promise.withResolvers<void>();
  const tx = db.transaction(STORE, 'readwrite');
  tx.objectStore(STORE).delete(id);
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error ?? new Error('删除 LUT 失败'));
  return promise;
}

export async function loadLuts(): Promise<StoredLut[]> {
  try {
    const db = await open();
    const { promise, resolve, reject } = Promise.withResolvers<StoredLut[]>();
    const tx = db.transaction(STORE, 'readonly');
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result as StoredLut[]);
    request.onerror = () => reject(request.error ?? new Error('读取 LUT 失败'));
    return await promise;
  } catch {
    // A blocked or unavailable database must not stop the editor from opening.
    return [];
  }
}
