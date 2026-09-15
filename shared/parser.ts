import type { Diagnostic, EventKind, TranscriptEvent } from './types.js';
import { present } from './presentation.js';
import { ViewerError } from './errors.js';

export const LIMITS = { fileBytes: 128 * 1024 * 1024, lineBytes: 512 * 1024, events: 50_000, previewChars: 8_000, totalPreviewChars: 16 * 1024 * 1024, diagnostics: 1_000 };
export const EVENT_KINDS: EventKind[] = ['user', 'assistant', 'tool_use', 'tool_result', 'thinking', 'system', 'progress', 'summary', 'file_history', 'session', 'unknown'];
export interface ParsedFile {
  events: TranscriptEvent[];
  diagnostics: Diagnostic[];
  pendingTail: boolean;
  sessionIds: string[];
  cwdPaths: string[];
  counts: Record<EventKind, number>;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
}

export interface JsonlLine { line: number; raw: string; terminated: boolean; }

type RecordValue = Record<string, unknown>;
const object = (value: unknown): RecordValue => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {};
const string = (value: unknown): string | null => typeof value === 'string' && value.length ? value : null;
export async function parseLines(lines: AsyncIterable<JsonlLine>, sourceId: string): Promise<ParsedFile> {
  const events: TranscriptEvent[] = [];
  const diagnostics: Diagnostic[] = [];
  const sessions = new Set<string>();
  const cwdPaths = new Set<string>();
  const counts = Object.fromEntries(EVENT_KINDS.map(kind => [kind, 0])) as Record<EventKind, number>;
  let pendingTail = false;
  let totalChars = 0;
  for await (const entry of lines) {
    if (!entry.raw.trim()) continue;
    let value: unknown;
    try { value = JSON.parse(entry.raw); }
    catch (error) {
      const message = (error as Error).message;
      const position = /at position (\d+)/.exec(message);
      const incomplete = /unexpected end|unterminated string/i.test(message) || (position !== null && Number(position[1]) === entry.raw.length);
      if (!entry.terminated && incomplete) pendingTail = true;
      else {
        if (diagnostics.length >= LIMITS.diagnostics) throw new ViewerError(413, '잘못된 JSON 행이 1,000개를 초과합니다. 파일 형식을 확인해 주세요.');
        diagnostics.push({ line: entry.line, message: '올바른 JSON이 아닌 행입니다. 다른 정상 행은 계속 표시합니다.' });
      }
      continue;
    }
    const record = object(value);
    const message = object(record.message);
    const sessionId = string(record.sessionId) ?? string(record.session_id);
    const cwd = string(record.cwd);
    const time = string(record.timestamp);
    const timestamp = time && Number.isFinite(Date.parse(time)) ? new Date(time).toISOString() : null;
    if (sessionId) sessions.add(sessionId);
    if (cwd) cwdPaths.add(cwd);
    const role = string(message.role) ?? string(record.type);
    const content = message.content ?? record.content;
    const conversation = record.type === 'user' || record.type === 'assistant' || (!record.type && content !== undefined);
    const plainSystem = record.type === 'system' && !record.subtype && typeof content === 'string';
    const blocks = conversation ? (Array.isArray(content) && content.length ? content : [content ?? value]) : [plainSystem ? content : value];
    for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
      const block = object(blocks[blockIndex]);
      const presentation = present(record, blocks[blockIndex], role, LIMITS.previewChars);
      const { kind, text, details, title, partial, truncated } = presentation;
      totalChars += text.length + (title?.length ?? 0) + details.reduce((sum, field) => sum + field.label.length + field.value.length, 0);
      if (events.length >= LIMITS.events || totalChars > LIMITS.totalPreviewChars) throw new ViewerError(413, '이벤트 50,000개 또는 미리보기 합계 16,777,216자 제한을 초과합니다. 파일을 나누어 열어 주세요.');
      events.push({
        id: `${sourceId}:${entry.line}:${blockIndex}`, kind, line: entry.line, blockIndex, timestamp, sessionId, cwd, text, details, title, partial, truncated,
        isError: block.is_error === true || record.is_error === true || record.level === 'error' || record.subtype === 'api_error' || (record.type === 'result' && typeof record.subtype === 'string' && record.subtype.startsWith('error')) || [record, object(record.data)].some(part => part.is_error === true || ['error', 'failed'].includes(String(part.status ?? part.outcome)) || (typeof (part.exit_code ?? part.exitCode) === 'number' && (part.exit_code ?? part.exitCode) !== 0)),
        ...(kind === 'tool_use' ? { toolName: string(block.name) ?? 'unknown', toolUseId: string(block.id) ?? undefined } : {}),
        ...(kind === 'tool_result' ? { toolUseId: string(block.tool_use_id) ?? undefined } : {}),
      });
      counts[kind]++;
    }
  }
  const uses = new Map<string, TranscriptEvent[]>();
  const results = new Map<string, TranscriptEvent[]>();
  const key = (event: TranscriptEvent) => JSON.stringify([sourceId, event.sessionId, event.toolUseId]);
  for (const event of events) {
    if (event.kind !== 'tool_use' && event.kind !== 'tool_result') continue;
    event.linkState = 'missing';
    if (!event.sessionId || !event.toolUseId) continue;
    const map = event.kind === 'tool_use' ? uses : results;
    const group = map.get(key(event)) ?? [];
    group.push(event);
    map.set(key(event), group);
  }
  for (const event of events) {
    if (!event.toolUseId || !event.sessionId || (event.kind !== 'tool_result' && event.kind !== 'tool_use')) continue;
    const calls = uses.get(key(event)) ?? [];
    const replies = results.get(key(event)) ?? [];
    if (calls.length > 1 || replies.length > 1) event.linkState = 'ambiguous';
    else if (calls.length === 1 && replies.length === 1) {
      event.linkState = 'linked';
      event.linkedEventId = (event.kind === 'tool_use' ? replies[0] : calls[0]).id;
      if (event.kind === 'tool_result') event.toolName = calls[0].toolName;
    }
  }
  const times = events.map(event => event.timestamp).filter((time): time is string => time !== null).sort();
  return { events, diagnostics, pendingTail, sessionIds: [...sessions].sort(), cwdPaths: [...cwdPaths].sort(), counts, firstTimestamp: times[0] ?? null, lastTimestamp: times.at(-1) ?? null };
}
