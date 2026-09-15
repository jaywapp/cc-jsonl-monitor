import assert from 'node:assert/strict';
import { test } from 'node:test';
import { groupConversation } from '../src/conversation';
import type { EventKind, TranscriptEvent } from '../shared/types';

const event = (id: string, kind: EventKind, sessionId: string | null = 'a', timestamp: string | null = '2026-09-15T01:00:00Z'): TranscriptEvent => ({ id, kind, sessionId, timestamp, line: 1, blockIndex: 0, cwd: null, text: id, isError: false });

test('conversation grouping preserves order and separates messages, sessions, dates and unknown times', () => {
  const events = [event('1', 'user'), event('2', 'tool_use'), event('3', 'tool_result'), event('4', 'assistant'), event('5', 'progress', 'b'), event('6', 'progress', 'b', '2026-09-16T00:00:00Z'), event('7', 'system', 'b', null), event('8', 'system', null, null)];
  const groups = groupConversation(events, 'utc');
  assert.deepEqual(groups.map(group => group.events.map(item => item.id)), [['1'], ['2', '3'], ['4'], ['5'], ['6'], ['7'], ['8']]);
  assert.deepEqual(groups.flatMap(group => group.events), events);
  assert.equal(groups[0].type, 'message');
  assert.equal(groups[1].type, 'activity');
  assert.equal(groups.at(-1)?.day, '시각 미상');
  const reverse = groupConversation([...events].reverse(), 'utc');
  assert.deepEqual(reverse.flatMap(group => group.events).map(item => item.id), events.map(item => item.id).reverse());
});
