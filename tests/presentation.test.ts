import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseLines, LIMITS } from '../shared/parser.js';
import { queryFile } from '../shared/query.js';

async function parse(records: unknown[]) {
  async function* lines() { for (let i = 0; i < records.length; i++) yield { line: i + 1, raw: JSON.stringify(records[i]), terminated: true }; }
  return parseLines(lines(), 'synthetic');
}
const visible = (event: Awaited<ReturnType<typeof parse>>['events'][number]) => [event.title, event.text, ...(event.details ?? []).flatMap(field => [field.label, field.value])].join('\n');

test('recognizes transcript bookkeeping and SDK events without serializing their objects', async () => {
  const parsed = await parse([
    { type: 'progress', data: { type: 'bash_progress', output: '7 tests passed', elapsedTimeSeconds: 3 } },
    { type: 'progress', data: { type: 'agent_progress', agentId: 'reviewer', message: { message: { content: [{ type: 'text', text: 'Checked authentication' }] } } } },
    { type: 'summary', summary: 'Resolved login failure' },
    { type: 'system', subtype: 'compact_boundary', compact_metadata: { trigger: 'auto', pre_tokens: 12000 } },
    { type: 'file-history-snapshot', snapshot: { trackedFileBackups: { 'src/auth-helper.ts': { version: 2, backupTime: '2026-09-15T00:00:00Z' } } } },
    { type: 'queue-operation', operation: 'enqueue', content: 'Review the change' },
    { type: 'custom-title', customTitle: 'Login improvement' },
    { type: 'system', subtype: 'init', model: 'model-name', tools: ['Read', 'Bash'] },
    { type: 'result', subtype: 'error_during_execution', errors: ['Connection lost'], duration_ms: 500 },
    { type: 'system', subtype: 'hook_response', outcome: 'error', exit_code: 1, output: 'Hook failed' },
    { type: 'tool_progress', tool_name: 'Bash', elapsed_time_seconds: 5 },
  ]);
  assert.deepEqual(parsed.events.map(event => event.kind), ['progress', 'progress', 'summary', 'summary', 'file_history', 'progress', 'session', 'system', 'system', 'progress', 'progress']);
  assert.match(visible(parsed.events[1]), /Checked authentication/);
  assert.equal(parsed.events[2].text, 'Resolved login failure');
  assert.match(visible(parsed.events[3]), /자동/);
  assert.match(visible(parsed.events[4]), /src\/auth-helper.ts/);
  assert.match(visible(parsed.events[5]), /요청 추가/);
  assert.ok(parsed.events[8].isError && parsed.events[9].isError);
  assert.ok(parsed.events.every(event => !visible(event).includes('{') && !visible(event).includes('"type"')));
  const view = queryFile({ actual: 'synthetic', revision: '1', size: 1, modifiedAt: '', parsed }, new URLSearchParams('titles=progress&q=authentication'));
  assert.equal(view.matchedEvents, 1);
  assert.equal(queryFile({ actual: '', revision: '', size: 1, modifiedAt: '', parsed }, new URLSearchParams('titles=summary&q=대화 압축')).matchedEvents, 1);
});

test('unknown, primitive, nested JSON text, and new content blocks remain readable and partial', async () => {
  const parsed = await parse([
    { type: 'future_event', payload: { note: 'Useful finding', enabled: false, attempts: 0, optional: null, values: ['first', 'second'] } },
    { type: 'future_event', content: '{"status":"running","detail":{"message":"Nested finding"}}' },
    { type: 'assistant', message: { content: [{ type: 'future_block', text: 'Preserved text' }] } },
    null, 42, ['alpha', 'beta'], { type: 'constructor', constructor: { toString: 'literal field' } },
  ]);
  assert.ok(parsed.events.every(event => event.kind === 'unknown' && event.partial));
  assert.match(visible(parsed.events[0]), /아니요/);
  assert.match(visible(parsed.events[0]), /\n0\n/);
  assert.match(visible(parsed.events[0]), /값 없음/);
  assert.match(visible(parsed.events[1]), /진행 중/);
  assert.match(visible(parsed.events[1]), /Nested finding/);
  assert.equal(parsed.events[2].text, 'Preserved text');
  assert.match(visible(parsed.events[6]), /literal field/);
  assert.ok(parsed.events.every(event => !visible(event).includes('{')));
});

test('tool inputs and JSON results become fields, attachments suppress encoded payloads, secrets retain masking hints', async () => {
  const parsed = await parse([{ type: 'assistant', message: { content: [
    { type: 'tool_use', name: 'Read', input: { file_path: 'src/app.ts', password: 'synthetic-only', options: { access_token: 'synthetic-token' } } },
    { type: 'tool_result', content: [{ type: 'text', text: '{"status":"completed","count":3}' }] },
    { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'YWJjZA==' } },
    { type: 'redacted_thinking', data: 'never-display-this', signature: 'never-display-signature' },
  ] } }]);
  assert.equal(parsed.events[0].details?.filter(field => field.sensitive).length, 2);
  assert.match(visible(parsed.events[1]), /완료/);
  assert.equal(parsed.events[2].title, '첨부 이미지');
  assert.doesNotMatch(visible(parsed.events[2]), /YWJjZA/);
  assert.doesNotMatch(visible(parsed.events[3]), /never-display/);
});

test('projection bounds fields, depth, and total characters while preserving truncation notices', async () => {
  let deep: unknown = 'bottom';
  for (let i = 0; i < 40; i++) deep = { nested: deep };
  const parsed = await parse([
    { type: 'future', payload: Object.fromEntries(Array.from({ length: 100 }, (_, i) => ['field' + i, 'x'.repeat(3000)])) },
    { type: 'future', payload: deep },
    { type: 'user', content: 'x'.repeat(9000) },
  ]);
  for (const event of parsed.events) {
    assert.equal(event.truncated, true);
    assert.ok((event.details?.length ?? 0) <= 24);
    const size = event.text.length + (event.title?.length ?? 0) + (event.details ?? []).reduce((sum, field) => sum + field.label.length + field.value.length, 0);
    assert.ok(size <= LIMITS.previewChars);
  }
});
