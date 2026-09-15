import { queryFile } from '../shared/query.js';
import { createHash, randomUUID } from 'node:crypto';
import { opendir, realpath, stat } from 'node:fs/promises';
import type { BigIntStats } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';
import type { FileView, RawRecord, Source, TreeEntry, TreeResult, ViewerConfig } from '../shared/types.js';
import { ViewerError } from './errors.js';
import { LIMITS, parseFile, readLines, type ParsedFile } from './parser.js';

type Snapshot = { revision: string; size: number; modifiedAt: string; parsed: ParsedFile };
const revisionOf = (info: BigIntStats): string => createHash('sha256').update([info.dev, info.ino, info.size, info.mtimeNs, info.ctimeNs].join(':')).digest('hex').slice(0, 24);
const isJsonl = (file: string) => path.extname(file).toLowerCase() === '.jsonl';
export const isWithin = (root: string, candidate: string): boolean => {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
};

export class ViewerService {
  private sources = new Map<string, Source>();
  private cache = new Map<string, Snapshot>();
  private inFlight = new Map<string, Promise<Snapshot>>();
  readonly config: ViewerConfig;

  constructor(samplePath = path.resolve('samples')) {
    this.config = {
      defaultPath: path.join(process.env.CLAUDE_CONFIG_DIR || path.join(homedir(), '.claude'), 'projects'),
      samplePath, platform: process.platform,
    };
  }

  async register(input: unknown): Promise<Source> {
    if (typeof input !== 'string' || input.length > 4096) throw new ViewerError(400, '파일 또는 폴더의 절대 경로를 입력해 주세요.');
    let selected = input.trim();
    if ((selected.startsWith('"') && selected.endsWith('"')) || (selected.startsWith("'") && selected.endsWith("'"))) selected = selected.slice(1, -1).trim();
    if (!path.isAbsolute(selected) || selected.includes('\0')) throw new ViewerError(400, '파일 또는 폴더의 절대 경로를 입력해 주세요.');
    const resolved = await realpath(selected);
    const info = await stat(resolved);
    if (!info.isDirectory() && (!info.isFile() || !isJsonl(resolved))) throw new ViewerError(400, '폴더 또는 .jsonl 파일을 선택해 주세요.');
    const existing = [...this.sources.values()].find(source => source.path === resolved);
    if (existing) return existing;
    if (this.sources.size >= 32) throw new ViewerError(429, '등록 경로는 최대 32개입니다. 앱을 다시 시작해 주세요.');
    const source: Source = { id: randomUUID(), kind: info.isDirectory() ? 'directory' : 'file', path: resolved, name: path.basename(resolved) || resolved, initialPath: '' };
    this.sources.set(source.id, source);
    return source;
  }

  private async resolve(sourceId: string, relative: string, kind: 'file' | 'directory'): Promise<string> {
    const source = this.sources.get(sourceId);
    if (!source) throw new ViewerError(404, '등록된 경로를 찾을 수 없습니다. 경로를 다시 열어 주세요.');
    if (relative.includes('\0') || path.isAbsolute(relative) || /(^|[\\/])\.\.([\\/]|$)/.test(relative) || relative.includes(':')) throw new ViewerError(403, '등록한 경로 밖에는 접근할 수 없습니다.');
    if (source.kind === 'file' && (relative !== '' || kind !== 'file')) throw new ViewerError(403, '선택한 파일만 읽을 수 있습니다.');
    const candidate = source.kind === 'file' ? source.path : path.resolve(source.path, relative);
    if (!isWithin(source.path, candidate)) throw new ViewerError(403, '등록한 경로 밖에는 접근할 수 없습니다.');
    const actual = await realpath(candidate);
    if (!isWithin(source.path, actual) || (source.kind === 'file' && actual !== source.path)) throw new ViewerError(403, '등록한 경로 밖으로 연결되는 링크는 열 수 없습니다.');
    const info = await stat(actual);
    if (kind === 'directory' ? !info.isDirectory() : !info.isFile() || !isJsonl(actual)) throw new ViewerError(400, kind === 'directory' ? '폴더 경로를 선택해 주세요.' : '.jsonl 파일을 선택해 주세요.');
    return actual;
  }

  async tree(sourceId: string, relative = ''): Promise<TreeResult> {
    const directory = await this.resolve(sourceId, relative, 'directory');
    const source = this.sources.get(sourceId)!;
    const entries: TreeEntry[] = [];
    let warning: string | undefined;
    const dir = await opendir(directory);
    for await (const entry of dir) {
      if (entries.length >= 2000) { warning = '항목이 많아 처음 2,000개만 표시합니다. 경로 입력으로 하위 폴더를 직접 열어 주세요.'; break; }
      if (!entry.isDirectory() && !entry.isSymbolicLink() && !(entry.isFile() && isJsonl(entry.name))) continue;
      try {
        const actual = await realpath(path.join(directory, entry.name));
        if (!isWithin(source.path, actual)) continue;
        const info = await stat(actual);
        if (!info.isDirectory() && (!info.isFile() || !isJsonl(entry.name))) continue;
        entries.push({ name: entry.name, path: path.posix.join(relative.replaceAll('\\', '/'), entry.name), kind: info.isDirectory() ? 'directory' : 'file', size: info.size, modifiedAt: info.mtime.toISOString() });
      } catch { warning = '일부 항목은 삭제되었거나 접근할 수 없어 제외했습니다.'; }
    }
    entries.sort((a, b) => Number(b.kind === 'directory') - Number(a.kind === 'directory') || a.name.localeCompare(b.name, undefined, { numeric: true }));
    return { path: relative, entries, ...(warning ? { warning } : {}) };
  }

  async revision(sourceId: string, relative: string): Promise<{ revision: string; exists: boolean }> {
    try {
      const actual = await this.resolve(sourceId, relative, 'file');
      return { revision: revisionOf(await stat(actual, { bigint: true })), exists: true };
    } catch (error) {
      if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return { revision: '', exists: false };
      throw error;
    }
  }

  private async snapshot(sourceId: string, relative: string): Promise<Snapshot & { actual: string }> {
    const actual = await this.resolve(sourceId, relative, 'file');
    const info = await stat(actual, { bigint: true });
    if (info.size > BigInt(LIMITS.fileBytes)) throw new ViewerError(413, '파일이 128 MiB 제한을 초과합니다. 파일을 나누어 열어 주세요.');
    const revision = revisionOf(info);
    const key = `${sourceId}:${actual}`;
    const cached = this.cache.get(key);
    if (cached?.revision === revision) {
      this.cache.delete(key);
      this.cache.set(key, cached);
      return { ...cached, actual };
    }
    this.cache.delete(key);
    const flightKey = `${key}:${revision}`;
    let flight = this.inFlight.get(flightKey);
    if (!flight) {
      if (this.inFlight.size >= 4) throw new ViewerError(429, '다른 파일을 읽고 있습니다. 잠시 후 다시 시도해 주세요.');
      flight = (async () => {
        const parsed = await parseFile(actual, createHash('sha256').update(key).digest('hex').slice(0, 16));
        const after = await stat(actual, { bigint: true });
        if (revisionOf(after) !== revision) throw new ViewerError(409, '읽는 동안 파일이 변경되었습니다. 새로고침해 주세요.');
        const result = { parsed, revision, size: Number(info.size), modifiedAt: new Date(Number(info.mtimeMs)).toISOString() };
        this.cache.set(key, result);
        while (this.cache.size > 3) this.cache.delete(this.cache.keys().next().value!);
        return result;
      })().finally(() => this.inFlight.delete(flightKey));
      this.inFlight.set(flightKey, flight);
    }
    return { ...await flight, actual };
  }

  async file(sourceId: string, relative: string, params: URLSearchParams): Promise<FileView> {
    return queryFile(await this.snapshot(sourceId, relative), params);
  }

  async raw(sourceId: string, relative: string, line: number, revision: string): Promise<RawRecord> {
    if (!Number.isSafeInteger(line) || line < 1 || !revision) throw new ViewerError(400, '행 번호와 파일 버전이 필요합니다.');
    const actual = await this.resolve(sourceId, relative, 'file');
    if (revisionOf(await stat(actual, { bigint: true })) !== revision) throw new ViewerError(409, '파일이 변경되었습니다. 새로고침한 뒤 원문을 열어 주세요.');
    let result: RawRecord | null = null;
    for await (const entry of readLines(actual)) {
      if (entry.line === line) { result = { line, raw: entry.raw, truncated: false }; break; }
    }
    if (revisionOf(await stat(actual, { bigint: true })) !== revision) throw new ViewerError(409, '파일이 변경되었습니다. 새로고침한 뒤 원문을 열어 주세요.');
    if (!result) throw new ViewerError(404, '해당 행을 찾을 수 없습니다.');
    return result;
  }
}
