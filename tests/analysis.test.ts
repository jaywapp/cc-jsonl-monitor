import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseLines } from '../shared/parser';
import { analyzeFile } from '../shared/analysis';
import { BrowserFiles, type LocalFile } from '../src/browser/filesystem';

async function parsed(records: unknown[]) {
  async function* lines() { for (const [index, value] of records.entries()) yield { line: index + 1, raw: JSON.stringify(value), terminated: true }; }
  return parseLines(lines(), 'analysis-test');
}
const user = (sessionId: string | null = 'a') => ({ type: 'user', sessionId, content: 'request' });
const call = (id: string, sessionId: string | null = 'a', input: unknown = { command: 'npm test' }) => ({ type: 'assistant', sessionId, message: { content: [{ type: 'tool_use', id, name: 'Bash', input }] } });
const result = (id: string, sessionId: string | null = 'a', is_error = false) => ({ type: 'user', sessionId, message: { content: [{ type: 'tool_result', tool_use_id: id, is_error, content: is_error ? 'failed' : 'done' }] } });
async function report(records: unknown[]) { return analyzeFile({ revision: 'v1', parsed: await parsed(records) }, 'v1'); }

test('analysis links retry evidence and repeated projected input within a request', async () => {
  const data = await report([user(), call('1'), result('1', 'a', true), call('2'), result('2'), call('3'), result('3'), { type: 'assistant', sessionId: 'a', content: 'done' }, user(), call('4')]);
  assert.equal(data.requests, 2); assert.equal(data.toolCalls, 4);
  assert.equal(data.responses, 1); assert.equal(data.errors, 1);
  assert.deepEqual(data.tools[0], { name: 'Bash', calls: 4, linkedResults: 3, errors: 1, unlinked: 1 });
  assert.deepEqual(data.patterns.map(p => [p.kind, p.count, p.evidence.map(e => e.line)]), [['retry', 1, [2, 3, 4]], ['repeat', 3, [2, 4, 6]]]);
  assert.deepEqual(data.flows.map(f => [f.calls, f.responses, f.errors, f.lastLine]), [[3, 1, 1, 8], [1, 0, 0, 10]]);
});

test('analysis isolates sessions, request boundaries and unknown sessions', async () => {
  const data = await report([user('a'), call('1'), result('1', 'a', true), user('a'), call('2'), user('b'), call('3', 'b'), call('4', null), call('5', null), call('6', null)]);
  assert.equal(data.totalPatterns, 0);
  assert.equal(data.missingSessions, 3);
  assert.equal(data.totalFlows, 3);
  assert.equal(data.toolCalls, 6);
});

test('different input and partial projections never produce equality patterns', async () => {
  const data = await report([user(), call('1', 'a', { command: 'test a' }), call('2', 'a', { command: 'test b' }), call('3', 'a', { command: 'test c' })]);
  assert.equal(data.totalPatterns, 0);
  const source = await parsed([user(), call('1'), call('2'), call('3')]);
  source.events[1].truncated = true; source.events[2].partial = true;
  const analysis = analyzeFile({ revision: 'v', parsed: source }, 'v');
  assert.equal(analysis.totalPatterns, 0); assert.equal(analysis.partialEvents, 2);
});

test('ambiguous and out-of-order results cannot seed retries or false tool errors', async () => {
  const data = await report([user(), result('before', 'a', true), call('before'), call('next'), call('duplicate'), call('duplicate'), result('duplicate', 'a', true), call('after')]);
  assert.equal(data.patterns.filter(p => p.kind === 'retry').length, 0);
  assert.equal(data.tools[0].errors, 0); assert.equal(data.tools[0].linkedResults, 0);
});

test('delayed results from previous requests do not imply retries in new requests', async () => {
  const data = await report([user(), call('1'), user(), result('1', 'a', true), call('2')]);
  assert.equal(data.totalPatterns, 0);
});

test('analysis rejects stale revisions and reports missing or unreadable coverage', async () => {
  const source = await parsed([user(null)]);
  source.diagnostics.push({ line: 2, message: 'invalid' }); source.pendingTail = true;
  assert.throws(() => analyzeFile({ revision: 'new', parsed: source }, 'old'), /변경/);
  assert.throws(() => analyzeFile({ revision: 'new', parsed: source }, ''), /버전/);
  const data = analyzeFile({ revision: 'new', parsed: source }, 'new');
  assert.equal(data.diagnostics, 1); assert.equal(data.pendingTail, true);
  assert.equal(data.missingTimes, 1); assert.equal(data.totalFlows, 0);
  assert.equal((await report([])).totalEvents, 0);
});

test('analysis keeps exact totals while bounding displayed flows, tools and patterns', async () => {
  const records = Array.from({ length: 30 }, (_, i) => [
    user('s' + i), ...Array.from({ length: 3 }, (_, j) => ({ type: 'assistant', sessionId: 's' + i, message: { content: [{ type: 'tool_use', id: i + '-' + j, name: 'tool-' + i, input: { value: 'same' } }] } })),
  ]).flat();
  const data = await report(records);
  assert.equal(data.totalEvents, 120); assert.equal(data.toolCalls, 90);
  assert.equal(data.totalTools, 30); assert.equal(data.tools.length, 20);
  assert.equal(data.totalFlows, 30); assert.equal(data.flows.length, 20);
  assert.equal(data.totalPatterns, 30); assert.equal(data.patterns.length, 20);
});

test('browser analysis covers the whole file, preserves access checks and follows refresh', async () => {
  const sample = await readFile('samples/atlas/work-patterns.jsonl', 'utf8');
  let contents = sample; let modified = 10;
  const handle: LocalFile = {
    kind: 'file', name: 'patterns.jsonl',
    queryPermission: async () => 'granted', requestPermission: async () => 'granted', isSameEntry: async () => true,
    getFile: async () => new File([contents], 'patterns.jsonl', { lastModified: modified }),
  };
  const files = new BrowserFiles(); files.register('test', handle);
  const filtered = await files.file('test', '', new URLSearchParams('q=not-present&limit=1'));
  assert.equal(filtered.events.length, 0);
  const data = await files.analysis('test', '', filtered.revision);
  assert.equal(data.totalEvents, 12); assert.equal(data.totalPatterns, 2);
  await assert.rejects(files.analysis('test', '../other.jsonl', filtered.revision));
  contents = JSON.stringify(user()); modified++;
  await assert.rejects(files.analysis('test', '', filtered.revision), /변경/);
  const refreshed = await files.file('test', '', new URLSearchParams('refresh=1'));
  assert.equal((await files.analysis('test', '', refreshed.revision)).totalPatterns, 0);
});
