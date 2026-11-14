/**
 * Armazenamento local de arquivos (laudos em PDF/imagem) no IndexedDB do navegador.
 * O app não tem servidor: o arquivo fica só neste navegador/dispositivo, como o resto dos dados.
 * Ao trocar por um backend, apenas este módulo muda.
 */
const DB = "semeia-files";
const STORE = "files";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("Este navegador não permite guardar arquivos localmente."));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Falha ao abrir o armazenamento local."));
  });
}

async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Falha no armazenamento local."));
  });
}

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_TYPES = ["application/pdf", "image/png", "image/jpeg", "image/webp"];

export async function saveFile(id: string, file: Blob) {
  await tx("readwrite", (s) => s.put(file, id));
}

export function loadFile(id: string): Promise<Blob | undefined> {
  return tx("readonly", (s) => s.get(id) as IDBRequest<Blob | undefined>);
}

export async function deleteFile(id: string) {
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {
    /* arquivo já ausente: nada a fazer */
  }
}
