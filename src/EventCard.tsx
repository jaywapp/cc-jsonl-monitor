import { EVENT_LABELS } from '../shared/event-labels';
import { useState } from 'react';
import { Bot, UserRound, Terminal, CornerDownRight, Settings2, FileQuestion, Brain, Activity, ListChecks, Files, Tag, Link2, AlertCircle } from 'lucide-react';
import type { TranscriptEvent } from '../shared/types';
import { formatTime, redact } from './format';

const icons = { user: UserRound, assistant: Bot, tool_use: Terminal, tool_result: CornerDownRight, thinking: Brain, system: Settings2, progress: Activity, summary: ListChecks, file_history: Files, session: Tag, unknown: FileQuestion };

interface Props { event: TranscriptEvent; timezone: string; masked: boolean; }

export default function EventCard({ event, timezone, masked }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const Icon = icons[event.kind];
  const text = redact(event.text, masked);
  const collapsed = !expanded && (text.length > 1400 || text.split('\n').length > 12 || event.kind === 'thinking');
  const shownText = collapsed ? text.slice(0, 1400).split('\n').slice(0, event.kind === 'thinking' ? 2 : 12).join('\n') : text;
  const fields = event.details ?? [];
  const visibleFields = detailsOpen ? fields : fields.slice(0, 4);

  return <article className={`event-card event-${event.kind} ${event.isError ? 'has-error' : ''}`} id={`event-${event.id}`}>
    <div className="event-avatar"><Icon size={17} strokeWidth={1.7} /></div>
    <div className="event-content">
      <header className="event-header"><strong>{event.title || EVENT_LABELS[event.kind]}</strong>{event.toolName && <span className="tool-label">{redact(event.toolName, masked)}</span>}
        {event.isError && <span className="error-label"><AlertCircle size={12} />오류</span>}
        <time dateTime={event.timestamp || undefined} title={event.timestamp || '기록에 유효한 시각이 없습니다.'}>{formatTime(event.timestamp, timezone)}</time>
      </header>
      {event.toolUseId && <p className="tool-connection"><span>{event.linkState === 'linked' ? <><Link2 size={12} />호출·결과 연결됨</> : event.linkState === 'ambiguous' ? '중복 ID · 연결 미확정' : event.kind === 'tool_use' ? '결과 미관측' : '호출 미확인'}</span><code title={redact(event.toolUseId, masked)}>{redact(event.toolUseId, masked)}</code></p>}
      <div className="event-body">{shownText || (fields.length ? '기록에 포함된 항목입니다.' : '이 기록에는 읽을 수 있는 내용이 없습니다.')}{collapsed && <span className="text-ellipsis"> …</span>}</div>
      {(collapsed || expanded) && <button className="text-button expand-content" type="button" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? '내용 접기' : '내용 더 보기'}</button>}
      {fields.length > 0 && <dl className="event-details">{visibleFields.map((field, index) => <div className="event-detail" key={index}>
        <dt>{redact(field.label, masked)}</dt><dd>{field.sensitive && masked ? '[가림]' : redact(field.value, masked)}</dd>
      </div>)}</dl>}
      {fields.length > 4 && <button className="text-button detail-toggle" type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(!detailsOpen)}>{detailsOpen ? '추가 항목 접기' : `추가 항목 ${fields.length - 4}개 보기`}</button>}
      {event.partial && <p className="event-note">아직 분류되지 않은 형식입니다. 확인 가능한 내용만 표시합니다.</p>}
      {event.truncated && <p className="event-note">길거나 복잡한 기록의 일부 항목과 내용은 생략했습니다.</p>}
      <div className="event-bottom"><span className="record-location">{event.line}번째 줄{event.blockIndex > 0 ? ` · 항목 ${event.blockIndex + 1}` : ''}</span>
        {event.sessionId && <span className="event-session" title={redact(event.sessionId, masked)}>{redact(event.sessionId, masked)}</span>}
      </div>
    </div>
  </article>;
}
