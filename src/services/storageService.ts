import type { ScanRecord } from '../types';

const DB_NAME = 'manuscrita_db';
const DB_VERSION = 1;
const STORE_NAME = 'scans';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB no está disponible en este navegador.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('No se pudo abrir el historial local.'));
  });
}

export async function saveScanToHistory(scan: ScanRecord): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(scan);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('Error al guardar el escaneo en IndexedDB.'));
    };
  });
}

export async function getAllScansFromHistory(): Promise<ScanRecord[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const records = (request.result as ScanRecord[]) || [];
      records.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      db.close();
      resolve(records);
    };
    request.onerror = () => {
      db.close();
      reject(request.error || new Error('No se pudieron cargar los escaneos guardados.'));
    };
  });
}

export async function deleteScanFromHistory(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('No se pudo eliminar el escaneo.'));
    };
  });
}

export async function clearAllScansFromHistory(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();

    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error || new Error('No se pudo borrar el historial.'));
    };
  });
}

function normalizeSearchText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Filtra el historial buscando por título, texto transcrito e ítems de listas
 * (insensible a mayúsculas y tildes).
 */
export function filterScansByQuery(scans: ScanRecord[], query: string): ScanRecord[] {
  const q = normalizeSearchText(query.trim());
  if (!q) return scans;

  return scans.filter((scan) => {
    if (normalizeSearchText(scan.titulo).includes(q)) return true;

    const inPages = scan.paginas.some((p) => normalizeSearchText(p.texto).includes(q));
    if (inPages) return true;

    const inLists = scan.listas.some((list) =>
      list.items.some((item) => normalizeSearchText(item.texto).includes(q)),
    );
    return inLists;
  });
}

export function countPendingChecklistItems(scan: ScanRecord): {
  total: number;
  completed: number;
  pending: number;
} {
  let total = 0;
  let completed = 0;
  for (const list of scan.listas) {
    for (const item of list.items) {
      total++;
      if (item.completado) completed++;
    }
  }
  return {
    total,
    completed,
    pending: total - completed,
  };
}
