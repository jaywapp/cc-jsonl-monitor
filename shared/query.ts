import type { FileView, EventKind } from './types.js';
import type { ParsedFile } from './parser.js';
import { EVENT_KINDS } from './parser.js';
import { ViewerError } from './errors.js';

export function queryFile(snapshot: { actual: string; revision: string; size: number; modifiedAt: string; parsed: ParsedFile }, params: URLSearchParams): FileView {
  const offset = integer(params.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
  const limit = integer(params.get('limit'), 100, 1, 200);
  const kind = params.get('kind') || 'all';
  const titles = params.has('titles') ? params.get('titles')!.split(',').filter(Boolean) : null;
  if (titles?.some(title => !EVENT_KINDS.includes(title as EventKind))) throw new ViewerError(400, '지원하지 않는 기록 제목입니다.');
  if (!['all', 'tools', 'error', ...EVENT_KINDS].includes(kind)) throw new ViewerError(400, '지원하지 않는 이벤트 종류입니다.');
  const order = params.get('order') || 'asc';
  if (order !== 'asc' && order !== 'desc') throw new ViewerError(400, '정렬 순서를 확인해 주세요.');
  const timezone = params.get('timezone') || 'local';
  if (timezone !== 'local' && timezone !== 'utc') throw new ViewerError(400, '시간대는 local 또는 utc여야 합니다.');
  const from = dateBoundary(params.get('from'), timezone, false);
  const to = dateBoundary(params.get('to'), timezone, true);
  if (from !== null && to !== null && from >= to) throw new ViewerError(400, '시작 날짜는 종료 날짜보다 늦을 수 없습니다.');
  const query = (params.get('q') ?? '').toLocaleLowerCase();
  if (query.length > 1000) throw new ViewerError(400, '검색어는 1,000자 이내로 입력해 주세요.');
  const session = params.get('session');
  const parsed = snapshot.parsed;
  const matches = parsed.events.filter(event => {
    if (titles && !titles.includes(event.kind)) return false;
    if (kind === 'error' ? !event.isError : kind === 'tools' ? event.kind !== 'tool_use' && event.kind !== 'tool_result' : kind !== 'all' && kind !== event.kind) return false;
    if (session && event.sessionId !== session) return false;
    if (query && ![event.text, event.toolName, event.toolUseId, event.sessionId, event.cwd].some(value => value?.toLocaleLowerCase().includes(query))) return false;
    if (from !== null || to !== null) {
      if (!event.timestamp) return false;
      const time = Date.parse(event.timestamp);
      if ((from !== null && time < from) || (to !== null && time >= to)) return false;
    }
    return true;
  }).sort((a, b) => {
    if (a.timestamp === null) return b.timestamp === null ? 0 : 1;
    if (b.timestamp === null) return -1;
    return a.timestamp.localeCompare(b.timestamp) * (order === 'desc' ? -1 : 1);
  });
  return { filePath: snapshot.actual, revision: snapshot.revision, size: snapshot.size, modifiedAt: snapshot.modifiedAt, totalEvents: parsed.events.length, matchedEvents: matches.length, offset, limit, events: matches.slice(offset, offset + limit), sessionIds: parsed.sessionIds, cwdPaths: parsed.cwdPaths, firstTimestamp: parsed.firstTimestamp, lastTimestamp: parsed.lastTimestamp, counts: parsed.counts, diagnostics: parsed.diagnostics, pendingTail: parsed.pendingTail, truncated: false };
  }

function integer(value: string | null, fallback: number, min: number, max: number): number {
  if (value === null) return fallback;
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < min || Number(value) > max) throw new ViewerError(400, '페이지 범위를 확인해 주세요.');
  return Number(value);
}

function dateBoundary(value: string | null, timezone: string, end: boolean): number | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ViewerError(400, '날짜는 YYYY-MM-DD 형식으로 입력해 주세요.');
  const [year, month, day] = value.split('-').map(Number);
  const date = timezone === 'utc' ? new Date(`${value}T00:00:00Z`) : new Date(`${value}T00:00:00`);
  const parts = timezone === 'utc' ? [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()] : [date.getFullYear(), date.getMonth() + 1, date.getDate()];
  if (parts[0] !== year || parts[1] !== month || parts[2] !== day) throw new ViewerError(400, '유효한 날짜를 입력해 주세요.');
  if (end) { if (timezone === 'utc') date.setUTCDate(date.getUTCDate() + 1); else date.setDate(date.getDate() + 1); }
  return date.getTime();
}
