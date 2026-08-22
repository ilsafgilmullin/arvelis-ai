const DB_NAME = 'arvelis-chat-attachments-v1';
const STORE_NAME = 'attachments';
const DB_VERSION = 1;
const ATTACHMENT_ID_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
    };
    request.onsuccess = () => resolve(request.result);
  });
}

async function withStore<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onerror = () => reject(request.error ?? new Error('Attachment storage request failed'));
      request.onsuccess = () => resolve(request.result);
      transaction.onabort = () => reject(transaction.error ?? new Error('Attachment storage transaction aborted'));
    });
  } finally {
    db.close();
  }
}

export function isValidAttachmentId(id: string): boolean {
  return ATTACHMENT_ID_PATTERN.test(id);
}

export async function saveChatAttachmentBlob(id: string, blob: Blob): Promise<boolean> {
  if (!isValidAttachmentId(id) || !(blob instanceof Blob) || blob.size <= 0) return false;
  try {
    await withStore('readwrite', (store) => store.put(blob, id));
    return true;
  } catch {
    return false;
  }
}

export async function loadChatAttachmentBlob(id: string): Promise<Blob | null> {
  if (!isValidAttachmentId(id)) return null;
  try {
    const value = await withStore<unknown>('readonly', (store) => store.get(id));
    return value instanceof Blob ? value : null;
  } catch {
    return null;
  }
}

export async function deleteChatAttachmentBlob(id: string): Promise<boolean> {
  if (!isValidAttachmentId(id)) return false;
  try {
    await withStore('readwrite', (store) => store.delete(id));
    return true;
  } catch {
    return false;
  }
}

export async function deleteChatAttachmentBlobs(ids: string[]): Promise<boolean> {
  const unique = [...new Set(ids.filter(isValidAttachmentId))];
  if (!unique.length) return true;
  const results = await Promise.all(unique.map((id) => deleteChatAttachmentBlob(id)));
  return results.every(Boolean);
}
