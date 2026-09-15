import type { TranscriptEvent } from '../shared/types';
import { formatTime } from './format';

export interface ConversationGroup { id: string; type: 'message' | 'activity'; day: string; session: string | null; events: TranscriptEvent[]; }

export function groupConversation(events: TranscriptEvent[], timezone: string): ConversationGroup[] {
  const groups: ConversationGroup[] = [];
  for (const event of events) {
    const type = event.kind === 'user' || event.kind === 'assistant' ? 'message' : 'activity';
    const day = formatTime(event.timestamp, timezone, true);
    const previous = groups.at(-1);
    if (type === 'activity' && previous?.type === 'activity' && previous.session === event.sessionId && previous.day === day) previous.events.push(event);
    else groups.push({ id: event.id, type, day, session: event.sessionId, events: [event] });
  }
  return groups;
}
