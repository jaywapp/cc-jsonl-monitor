import { EVENT_LABELS } from '../shared/event-labels';
import { useState } from 'react';
import { Bot, UserRound, Terminal, CornerDownRight, Settings2, FileQuestion, Brain, ChevronDown, ChevronRight, Link2, AlertCircle } from 'lucide-react';
import type { RawRecord, Source, TranscriptEvent } from '../shared/types';
import { api, endpoint, messageOf } from './api';
import { formatTime, redact } from './format';

const kinds = {
  user: { label: '사용자 요청', icon: UserRound },
  assistant: { label: 'Claude', icon: Bot },
  tool_use: { label: '도구 호출', icon: Terminal },
  tool_result: { label: '도구 결과', icon: CornerDownRight },
  thinking: { label: '생각 기록', icon: Brain },
  system: { label: '시스템', icon: Settings2 },
  unknown: { label: '미지원 기록', icon: FileQuestion },
};

interface Props { event: TranscriptEvent; source: Source; path: string; revision: string; timezone: string; masked: boolean; }

export default function EventCard({ event, source, path, revision, timezone, masked }: Props) {
  const [rawOpen, setRawOpen] = useState(false);
  const [raw, setRaw] = useState<RawRecord | null>(null);
  const [rawError, setRawError] = useState('');
  const [rawLoading, setRawLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const kind = kinds[event.kind];
  const Icon = kind.icon;
  const isCode = ['tool_use', 'tool_result', 'unknown'].includes(event.kind);
  const text = redact(event.text, masked);
  const collapsed = !expanded && (text.length > 1400 || text.split('\n').length > 12 || event.kind === 'thinking');
  const shownText = collapsed ? text.slice(0, 1400).split('\n').slice(0, event.kind === 'thinking' ? 2 : 12).join('\n') : text;

  async function toggleRaw() {
    if (rawOpen) { setRawOpen(false); return; }
    setRawOpen(true);
    if (raw) return;
    setRawLoading(true); setRawError('');
    try { setRaw(await api<RawRecord>(endpoint('raw', { source: source.id, path, line: event.line, revision }))); }
    catch (error) { setRawError(messageOf(error)); }
    finally { setRawLoading(false); }
  }

  return <article className={`event-card event-${event.kind} ${event.isError ? 'has-error' : ''}`} id={`event-${event.id}`}>
    <div className="event-avatar"><Icon size={17} strokeWidth={1.7} /></div>
    <div className="event-content">
      <header className="event-header"><strong>{EVENT_LABELS[event.kind]}</strong>{event.toolName && <span className="tool-label">{event.toolName}</span>}
        {event.isError && <span className="error-label"><AlertCircle size={12} />오류</span>}
        <time dateTime={event.timestamp || undefined} title={event.timestamp || '원문에 유효한 시각이 없습니다.'}>{formatTime(event.timestamp, timezone)}</time>
      </header>
      {event.toolUseId && <p className="tool-connection"><code>{event.toolUseId}</code><span>{event.linkState === 'linked' ? <><Link2 size={12} />호출·결과 연결됨</> : event.linkState === 'ambiguous' ? '중복 ID · 연결 미확정' : event.kind === 'tool_use' ? '결과 미관측' : '호출 미확인'}</span></p>}
      <div className={isCode ? 'event-body code-body' : 'event-body'}>{shownText || '표시할 텍스트가 없습니다. 원문을 확인해 주세요.'}{collapsed && <span className="text-ellipsis"> …</span>}</div>
      {(collapsed || expanded) && <button className="text-button expand-content" type="button" onClick={() => setExpanded(!expanded)}>{expanded ? '내용 접기' : '내용 더 보기'}</button>}
      {event.truncated && <p className="event-note">긴 내용의 일부만 표시합니다. 원문에서 확인하세요.</p>}
      <div className="event-bottom"><button type="button" className="raw-toggle" onClick={() => void toggleRaw()} aria-expanded={rawOpen}>{rawOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}원문 · {event.line}번째 줄{event.blockIndex > 0 ? ` / 블록 ${event.blockIndex + 1}` : ''}</button>
        {event.sessionId && <span className="event-session" title={event.sessionId}>{event.sessionId}</span>}
      </div>
      {rawOpen && <section className="raw-record" aria-label={`${event.line}번째 줄 원문`}>
        {rawLoading && <p role="status">원문을 읽는 중…</p>}
        {rawError && <p className="error-text" role="alert">{rawError}</p>}
        {raw && <><p>{masked ? '인식 가능한 민감 값을 가린 상태입니다. 모든 민감 정보가 탐지되지는 않습니다.' : '원문을 표시하고 있습니다. 민감 정보가 포함될 수 있습니다.'}</p><pre>{redact(prettyJson(raw.raw), masked)}</pre>{raw.truncated && <p>원문 크기 제한으로 일부만 표시됩니다.</p>}</>}
      </section>}
    </div>
  </article>;
}

function prettyJson(raw: string): string {
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
}
