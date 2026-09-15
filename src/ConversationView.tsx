import { Fragment } from 'react';
import { Activity, AlertCircle } from 'lucide-react';
import type { TranscriptEvent } from '../shared/types';
import { EVENT_LABELS } from '../shared/event-labels';
import EventCard from './EventCard';
import { groupConversation } from './conversation';
import { redact } from './format';

interface Props { events: TranscriptEvent[]; timezone: string; masked: boolean; filtered: boolean; }

export default function ConversationView({ events, timezone, masked, filtered }: Props) {
  const groups = groupConversation(events, timezone);
  const onlyActivity = groups.every(group => group.type === 'activity');
  return <div className="events-list conversation-list" aria-label="저장된 대화">
    {groups.map((group, index) => {
      const previous = groups[index - 1];
      const errors = group.events.filter(event => event.isError).length;
      const kinds = [...new Set(group.events.map(event => EVENT_LABELS[event.kind]))].join(' · ');
      return <Fragment key={group.id}>
        {previous?.day !== group.day && <div className="conversation-divider">{group.day}</div>}
        {(!previous || previous.session !== group.session) && <p className="conversation-session">{group.session ? `세션 · ${redact(group.session, masked)}` : '세션 미확인'}</p>}
        {group.type === 'message' ? <EventCard event={group.events[0]} timezone={timezone} masked={masked} /> : <details className="activity-group" open={filtered || onlyActivity || errors > 0}>
          <summary><Activity size={15} /><strong>작업 내역 {group.events.length}개</strong><span className="activity-kinds">{kinds}</span>{errors > 0 && <span className="error-label"><AlertCircle size={12} />오류 {errors}개</span>}</summary>
          <div className="activity-content">{group.events.map(event => <EventCard key={event.id} event={event} timezone={timezone} masked={masked} />)}</div>
        </details>}
      </Fragment>;
    })}
  </div>;
}
