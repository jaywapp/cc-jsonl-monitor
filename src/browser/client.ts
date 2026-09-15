import type { Source, TreeEntry } from '../../shared/types';
import type { Handle, LocalDirectory, LocalFile } from './filesystem';

export const isExtension = import.meta.env.MODE === 'extension';
export interface RecentSource { id: string; name: string; kind: 'file' | 'directory'; handle: Handle; usedAt: number; }
interface PickerWindow {
  showDirectoryPicker(options: { mode: 'read'; id: string }): Promise<LocalDirectory>;
  showOpenFilePicker(options: { multiple: boolean; types: { description: string; accept: Record<string, string[]> }[] }): Promise<LocalFile[]>;
}
let worker: Worker | undefined;
let sequence = 0;
const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();

function request<T>(action: string, payload: Record<string, unknown> = {}, signal?: AbortSignal): Promise<T> {
  if (signal?.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'));
  if (!worker) {
    worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const task = pending.get(data.id);
      if (!task) return;
      pending.delete(data.id);
      if (data.error) task.reject(new Error(data.error)); else task.resolve(data.result);
    };
    worker.onerror = () => {
      for (const task of pending.values()) task.reject(new Error('기록 분석이 중단되었습니다. 폴더·파일을 다시 연결해 주세요.'));
      pending.clear(); worker?.terminate(); worker = undefined;
    };
  }
  const id = ++sequence;
  return new Promise<T>((resolve, reject) => {
    const abort = () => { pending.delete(id); reject(new DOMException('Cancelled', 'AbortError')); };
    const cleanup = () => signal?.removeEventListener('abort', abort);
    signal?.addEventListener('abort', abort, { once: true });
    pending.set(id, { resolve: (value) => { cleanup(); resolve(value as T); }, reject: (error) => { cleanup(); reject(error); } });
    try { worker!.postMessage({ id, action, ...payload }); }
    catch (error) { pending.delete(id); cleanup(); reject(error); }
  });
}

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('cc-jsonl-connections', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('recent', { keyPath: 'id' });
    open.onsuccess = () => resolve(open.result);
    open.onerror = () => reject(new Error('최근 연결을 저장하지 못했습니다. 브라우저 저장소 설정을 확인해 주세요.'));
  });
}
async function store<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('recent', mode);
    const request = operation(transaction.objectStore('recent'));
    transaction.oncomplete = () => { db.close(); resolve(request.result); };
    transaction.onabort = transaction.onerror = () => { db.close(); reject(new Error('최근 연결을 저장하지 못했습니다. 다시 시도해 주세요.')); };
  });
}
export async function recentSources(): Promise<RecentSource[]> {
  return (await store('readonly', (store) => store.getAll()) as RecentSource[]).sort((a,b) => b.usedAt - a.usedAt);
}
async function activate(recent: RecentSource): Promise<Source> {
  await store('readwrite', (store) => store.put({ ...recent, usedAt: Date.now() }));
  const source = await request<Source>('register', { source: recent.id, handle: recent.handle });
  const list = await recentSources();
  for (const stale of list.slice(8)) await store('readwrite', (store) => store.delete(stale.id));
  return source;
}
export async function pickSource(kind: 'file' | 'directory'): Promise<Source | null> {
  const picker = window as unknown as PickerWindow;
  let handle: Handle;
  try {
    // Invoke the native picker before any async storage work to preserve user activation.
    handle = kind === 'directory' ? await picker.showDirectoryPicker({ mode: 'read', id: 'claude-logs' })
      : (await picker.showOpenFilePicker({ multiple: false, types: [{ description: 'Claude Code JSONL', accept: { 'application/json': ['.jsonl'] } }] }))[0];
  } catch (error) { if ((error as Error).name === 'AbortError') return null; throw error; }
  if (!handle || (handle.kind === 'file' && !/\.jsonl$/i.test(handle.name))) throw new Error('.jsonl 파일을 선택해 주세요.');
  if (await handle.queryPermission({ mode: 'read' }) !== 'granted') throw new Error('선택한 경로의 읽기 권한을 허용해 주세요.');
  const recents = await recentSources();
  let existing: RecentSource | undefined;
  for (const item of recents) { if (await handle.isSameEntry(item.handle).catch(() => false)) { existing = item; break; } }
  return activate(existing ?? { id: crypto.randomUUID(), name: handle.name, kind: handle.kind, handle, usedAt: Date.now() });
}
export async function reconnect(recent: RecentSource): Promise<Source> {
  // Request directly from the click, including when a previous grant has expired.
  if (await recent.handle.requestPermission({ mode: 'read' }) !== 'granted') throw new Error('읽기 권한이 허용되지 않았습니다. 다시 연결하거나 다른 폴더를 선택해 주세요.');
  return activate(recent);
}
export async function restoreSource(): Promise<Source | null> {
  const latest = (await recentSources())[0];
  if (!latest || await latest.handle.queryPermission({ mode: 'read' }).catch(() => 'denied') !== 'granted') return null;
  return activate(latest);
}
export async function forgetSource(id: string, active: boolean): Promise<void> {
  await store('readwrite', (store) => store.delete(id));
  if (active) await request('clear');
}
export const resolveEntry = (source: string, path: string) => request<TreeEntry>('entry', { source, path });
export function browserApi<T>(url: string, signal?: AbortSignal): Promise<T> {
  const parsed = new URL(url, 'https://viewer.invalid');
  const params = parsed.searchParams;
  return request<T>(parsed.pathname.split('/').at(-1)!, { source: params.get('source') || '', path: params.get('path') || '', query: params.toString() }, signal);
}
