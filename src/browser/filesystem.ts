import { analyzeFile } from '../../shared/analysis';
import { LIMITS, parseLines, type JsonlLine, type ParsedFile } from '../../shared/parser';
import { queryFile } from '../../shared/query';
import type { Source, TreeEntry, TreeResult, RawRecord } from '../../shared/types';

export interface LocalHandle {
  kind: 'file' | 'directory';
  name: string;
  queryPermission(options: { mode: 'read' }): Promise<PermissionState>;
  requestPermission(options: { mode: 'read' }): Promise<PermissionState>;
  isSameEntry(other: LocalHandle): Promise<boolean>;
}
export interface LocalFile extends LocalHandle { kind: 'file'; getFile(): Promise<File>; }
export interface LocalDirectory extends LocalHandle {
  kind: 'directory';
  values(): AsyncIterable<Handle>;
  getDirectoryHandle(name: string): Promise<LocalDirectory>;
  getFileHandle(name: string): Promise<LocalFile>;
}
export type Handle = LocalFile | LocalDirectory;
export const fileRevision = (file: File) => `${file.lastModified}:${file.size}`;

export async function* blobLines(file: Blob): AsyncGenerator<JsonlLine> {
  if (file.size > LIMITS.fileBytes) throw new Error('파일이 128 MiB 제한을 초과합니다. 파일을 나누어 열어 주세요.');
  const reader = file.stream().getReader();
  const decoder = new TextDecoder('utf-8', { ignoreBOM: true });
  let pending = new Uint8Array(0);
  let line = 1;
  const decode = (bytes: Uint8Array) => decoder.decode(bytes).replace(/\r$/, '').replace(line === 1 ? /^\uFEFF/ : /$^/, '');
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const data = new Uint8Array(pending.length + chunk.value.length);
      data.set(pending); data.set(chunk.value, pending.length);
      let start = 0;
      for (let end = 0; end < data.length; end++) {
        if (data[end] !== 10) continue;
        if (end - start > LIMITS.lineBytes) throw new Error(`${line}행이 512 KiB 제한을 초과합니다.`);
        const raw = decode(data.subarray(start, end));
        yield { line: line++, raw, terminated: true };
        start = end + 1;
      }
      pending = data.slice(start);
      if (pending.length > LIMITS.lineBytes) throw new Error(`${line}행이 512 KiB 제한을 초과합니다.`);
    }
    if (pending.length) yield { line, raw: decode(pending), terminated: false };
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

export function relativeParts(path: string): string[] {
  if (/^[\\/]|:|\0/.test(path)) throw new Error('연결한 폴더 안의 상대 경로를 입력해 주세요.');
  const parts = path.replaceAll('\\', '/').split('/').filter(Boolean);
  if (parts.some(part => part === '..' || part === '.')) throw new Error('상위 폴더로 이동하는 경로는 열 수 없습니다.');
  return parts;
}

type Snapshot = { parsed: ParsedFile; revision: string; size: number; modifiedAt: string; actual: string };
export class BrowserFiles {
  private source: { info: Source; handle: Handle } | null = null;
  private cache = new Map<string, Snapshot>();
  private generations = new Map<string, string>();
  private flights = new Map<string, Promise<Snapshot>>();

  register(id: string, handle: Handle): Source {
    if (handle.kind === 'file' && !/\.jsonl$/i.test(handle.name)) throw new Error('.jsonl 파일을 선택해 주세요.');
    this.clear();
    const info: Source = { id, name: handle.name, path: handle.name, kind: handle.kind, initialPath: '' };
    this.source = { info, handle };
    return info;
  }
  clear() { this.source = null; this.cache.clear(); this.generations.clear(); }

  private async resolve(id: string, path: string): Promise<Handle> {
    const source = this.source;
    if (!source || source.info.id !== id) throw new Error('연결이 해제되었습니다. 폴더 또는 파일을 다시 연결해 주세요.');
    if (await source.handle.queryPermission({ mode: 'read' }) !== 'granted') throw new Error('읽기 권한이 필요합니다. 최근 연결에서 다시 연결해 주세요.');
    const parts = relativeParts(path);
    if (source.handle.kind === 'file' && parts.length) throw new Error('선택한 파일만 읽을 수 있습니다.');
    let handle: Handle = source.handle;
    for (let i = 0; i < parts.length; i++) {
      if (handle.kind !== 'directory') throw new Error('폴더 경로를 확인해 주세요.');
      const directory = handle;
      if (i === parts.length - 1) {
        try { handle = await directory.getFileHandle(parts[i]); }
        catch (error) {
          if ((error as Error).name !== 'TypeMismatchError') throw error;
          handle = await directory.getDirectoryHandle(parts[i]);
        }
      } else handle = await directory.getDirectoryHandle(parts[i]);
    }
    return handle;
  }
  async entry(id: string, path: string): Promise<TreeEntry> {
    const handle = await this.resolve(id, path);
    if (handle.kind === 'file' && !/\.jsonl$/i.test(handle.name)) throw new Error('.jsonl 파일을 선택해 주세요.');
    return { name: handle.name, path: relativeParts(path).join('/'), kind: handle.kind };
  }
  async tree(id: string, path: string): Promise<TreeResult> {
    const handle = await this.resolve(id, path);
    if (handle.kind !== 'directory') throw new Error('폴더를 선택해 주세요.');
    const entries: TreeEntry[] = [];
    let warning: string | undefined;
    for await (const child of handle.values()) {
      if (child.kind !== 'directory' && !/\.jsonl$/i.test(child.name)) continue;
      if (entries.length >= 2000) { warning = '처음 2,000개 항목만 표시합니다. 폴더 내 경로를 입력하거나 하위 폴더를 연결해 주세요.'; break; }
      try {
        const file = child.kind === 'file' ? await child.getFile() : null;
        entries.push({ name: child.name, kind: child.kind, path: [...relativeParts(path), child.name].join('/'), ...(file ? { size: file.size, modifiedAt: new Date(file.lastModified).toISOString() } : {}) });
      } catch { warning = '일부 항목은 삭제되었거나 접근할 수 없어 제외했습니다.'; }
    }
    entries.sort((a,b) => Number(b.kind === 'directory') - Number(a.kind === 'directory') || a.name.localeCompare(b.name, undefined, { numeric: true }));
    return { path, entries, warning };
  }
  private async fileHandle(id: string, path: string): Promise<LocalFile> {
    const handle = await this.resolve(id, path);
    if (handle.kind !== 'file' || !/\.jsonl$/i.test(handle.name)) throw new Error('.jsonl 파일을 선택해 주세요.');
    return handle;
  }
  async revision(id: string, path: string) {
    try { return { revision: fileRevision(await (await this.fileHandle(id, path)).getFile()), exists: true }; }
    catch (error) { if ((error as Error).name === 'NotFoundError') return { revision: '', exists: false }; throw error; }
  }
  private async snapshot(id: string, path: string): Promise<Snapshot> {
    const handle = await this.fileHandle(id, path);
    const file = await handle.getFile();
    const revision = fileRevision(file);
    const key = `${id}:${path}`;
    const cached = this.cache.get(key);
    if (cached?.revision === revision) { this.cache.delete(key); this.cache.set(key, cached); return cached; }
    this.cache.delete(key);
    const flightKey = `${key}:${revision}`;
    let flight = this.flights.get(flightKey);
    if (!flight) {
      if (this.flights.size >= 4) throw new Error('다른 파일을 읽고 있습니다. 잠시 후 다시 시도해 주세요.');
      const rootName = this.source!.info.name;
      flight = (async () => {
        const parsed = await parseLines(blobLines(file), key);
        if (fileRevision(await handle.getFile()) !== revision) throw new Error('읽는 동안 파일이 변경되었습니다. 새로고침해 주세요.');
        const result = { parsed, revision, size: file.size, modifiedAt: new Date(file.lastModified).toISOString(), actual: path ? `${rootName}/${path}` : rootName };
        if (this.source?.info.id === id) {
          this.cache.set(key, result);
          while (this.cache.size > 3) this.cache.delete(this.cache.keys().next().value!);
        }
        return result;
      })().finally(() => this.flights.delete(flightKey));
      this.flights.set(flightKey, flight);
    }
    return flight;
  }
  async file(id: string, path: string, params: URLSearchParams) {
    const key = id + ':' + path;
    const generation = params.get('refresh') || '0';
    if (this.generations.get(key) !== generation) this.cache.delete(key);
    this.generations.delete(key); this.generations.set(key, generation);
    while (this.generations.size > 32) this.generations.delete(this.generations.keys().next().value!);
    return queryFile(await this.snapshot(id, path), params);
  }
  async analysis(id: string, path: string, revision: string) {
    return analyzeFile(await this.snapshot(id, path), revision);
  }

  async raw(id: string, path: string, line: number, revision: string): Promise<RawRecord> {
    if (!Number.isSafeInteger(line) || line < 1 || !revision) throw new Error('행 번호와 파일 버전이 필요합니다.');
    const handle = await this.fileHandle(id, path);
    const file = await handle.getFile();
    const changed = () => new Error('파일이 변경되었습니다. 다시 읽은 뒤 원문을 열어 주세요.');
    if (fileRevision(file) !== revision) throw changed();
    let result: RawRecord | undefined;
    for await (const entry of blobLines(file)) {
      if (entry.line === line) { result = { line, raw: entry.raw, truncated: false }; break; }
    }
    if (fileRevision(await handle.getFile()) !== revision) throw changed();
    if (!result) throw new Error('해당 행을 찾을 수 없습니다.');
    return result;
  }
}

export function fileError(error: unknown): string {
  const name = (error as Error)?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError') return '읽기 권한이 없습니다. 폴더·파일을 다시 연결하거나 최근 연결에서 권한을 허용해 주세요.';
  if (name === 'NotFoundError') return '파일이나 폴더를 찾을 수 없습니다. 위치를 확인하고 다시 연결해 주세요.';
  if (name === 'NotReadableError') return '파일이 변경되었거나 읽을 수 없습니다. 잠시 후 다시 읽어 주세요.';
  return error instanceof Error ? error.message : '파일을 읽지 못했습니다. 다시 연결해 주세요.';
}
