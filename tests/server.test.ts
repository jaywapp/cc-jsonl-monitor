import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, mkdir, writeFile, appendFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { parseFile, LIMITS } from '../server/parser.js';
import { ViewerService, isWithin } from '../server/service.js';
import { createHandler } from '../server/index.js';

let directory: string;
before(async () => { directory = await mkdtemp(path.join(tmpdir(), 'jsonl-viewer-test-')); });
after(async () => { await rm(directory, { recursive: true, force: true }); });
let sequence = 0;
async function fixture(contents: string): Promise<string> {
  const file = path.join(directory, `fixture-${++sequence}.jsonl`);
  await writeFile(file, contents);
  return file;
}
const record = (text: string, extra = {}) => JSON.stringify({ type: 'user', sessionId: 'session-a', timestamp: '2026-09-14T10:00:00Z', message: { role: 'user', content: text }, ...extra });

test('stream parser handles BOM, CRLF, malformed lines, and a complete final record', async () => {
  const file = await fixture(`\uFEFF${record('first')}\r\n{bad json}\r\n${record('last')}`);
  const parsed = await parseFile(file, 'source');
  assert.deepEqual(parsed.events.map(event => [event.line, event.text]), [[1, 'first'], [3, 'last']]);
  assert.equal(parsed.diagnostics[0].line, 2);
  assert.equal(parsed.pendingTail, false);
});

test('partial tail is pending; malformed complete tail is diagnosed', async () => {
  const pending = await parseFile(await fixture(`${record('valid')}\n{"message":"not finished`), 'source');
  assert.equal(pending.pendingTail, true);
  assert.equal(pending.events.length, 1);
  assert.equal(pending.diagnostics.length, 0);
  const malformed = await parseFile(await fixture(`${record('valid')}\n{"bad":}`), 'source');
  assert.equal(malformed.pendingTail, false);
  assert.equal(malformed.diagnostics.length, 1);
  for (const tail of ['{', '{"key":1', '{"key":"value"', '{"key":true,']) {
    const incomplete = await parseFile(await fixture(tail), 'source');
    assert.equal(incomplete.pendingTail, true, tail);
    assert.equal(incomplete.diagnostics.length, 0, tail);
  }
});

test('multiple content blocks distinguish results from user prompts and link by session and call ID', async () => {
  const tool = (sessionId: string, content: unknown[]) => JSON.stringify({ type: 'assistant', sessionId, message: { content } });
  const parsed = await parseFile(await fixture([
    tool('a', [{ type: 'text', text: 'working' }, { type: 'thinking', thinking: 'reasoning' }, { type: 'tool_use', id: 'same', name: 'Read', input: { file_path: '/synthetic/a' } }]),
    tool('b', [{ type: 'tool_use', id: 'same', name: 'Search', input: {} }]),
    JSON.stringify({ type: 'user', sessionId: 'b', message: { content: [{ type: 'tool_result', tool_use_id: 'same', content: 'B result' }] } }),
    JSON.stringify({ type: 'user', sessionId: 'a', message: { content: [{ type: 'tool_result', tool_use_id: 'same', content: [{ type: 'text', text: 'A result' }], is_error: true }] } }),
    JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 'same', content: 'No session' }] } }),
  ].join('\n')), 'source');
  assert.deepEqual(parsed.events.slice(0, 3).map(event => event.kind), ['assistant', 'thinking', 'tool_use']);
  const results = parsed.events.filter(event => event.kind === 'tool_result');
  assert.equal(results[0].toolName, 'Search');
  assert.equal(results[1].toolName, 'Read');
  assert.equal(results[1].isError, true);
  assert.equal(results[2].linkState, 'missing');
  assert.equal(parsed.counts.user, 0);
});

test('duplicate tool calls remain ambiguous and malformed metadata is ignored safely', async () => {
  const parsed = await parseFile(await fixture([
    JSON.stringify({ sessionId: 'a', message: { content: [{ type: 'tool_use', id: 'x' }, { type: 'tool_use', id: 'x' }, { type: 'tool_result', tool_use_id: 'x' }] } }),
    record('metadata', { timestamp: { invalid: true }, sessionId: 123, cwd: ['bad'] }),
    JSON.stringify({ unfamiliar: { nested: true } }),
  ].join('\n')), 'source');
  assert.ok(parsed.events.slice(0, 3).every(event => event.linkState === 'ambiguous' && !event.linkedEventId));
  assert.equal(parsed.events[3].timestamp, null);
  assert.equal(parsed.events[3].sessionId, null);
  assert.equal(parsed.events[3].cwd, null);
  assert.equal(parsed.events[4].kind, 'unknown');
  assert.match(parsed.events[4].text, /unfamiliar/);
});

test('large line fails explicitly and long previews are marked', async () => {
  await assert.rejects(parseFile(await fixture('x'.repeat(LIMITS.lineBytes + 1)), 'source'), { status: 413 });
  const parsed = await parseFile(await fixture(record('x'.repeat(9000))), 'source');
  assert.equal(parsed.events[0].text.length, LIMITS.previewChars);
  assert.equal(parsed.events[0].truncated, true);
});

test('file sorting is stable, missing times sort last, filters and pagination apply on server', async () => {
  const service = new ViewerService();
  const source = await service.register(await fixture([
    record('same-first'), record('missing', { timestamp: null }), record('same-second'),
    record('older', { timestamp: '2026-09-13T23:00:00Z', sessionId: 'session-b' }),
  ].join('\n')));
  const descending = await service.file(source.id, '', new URLSearchParams({ order: 'desc' }));
  assert.deepEqual(descending.events.map(event => event.text), ['same-first', 'same-second', 'older', 'missing']);
  const filter = await service.file(source.id, '', new URLSearchParams({ from: '2026-09-14', to: '2026-09-14', timezone: 'utc', q: 'SAME', session: 'session-a', offset: '1', limit: '1' }));
  assert.equal(filter.matchedEvents, 2);
  assert.deepEqual(filter.events.map(event => event.text), ['same-second']);
  await assert.rejects(service.file(source.id, '', new URLSearchParams({ from: '2026-02-30' })), { status: 400 });
  await assert.rejects(service.file(source.id, '', new URLSearchParams({ offset: '-1' })), { status: 400 });
});

test('directory roots list immediate JSONL children; traversal and standalone siblings are blocked', async () => {
  const root = path.join(directory, 'root');
  await mkdir(path.join(root, 'nested'), { recursive: true });
  await writeFile(path.join(root, 'one.jsonl'), record('one'));
  await writeFile(path.join(root, 'ignored.txt'), 'ignored');
  await writeFile(path.join(root, 'nested', 'two.jsonl'), record('two'));
  const sibling = await fixture(record('outside'));
  const service = new ViewerService();
  const source = await service.register(` "${root}" `);
  assert.deepEqual((await service.tree(source.id)).entries.map(entry => entry.name), ['nested', 'one.jsonl']);
  assert.equal((await service.tree(source.id, 'nested')).entries[0].path, 'nested/two.jsonl');
  await assert.rejects(service.file(source.id, '../' + path.basename(sibling), new URLSearchParams()), { status: 403 });
  await assert.rejects(service.file(source.id, '..\\' + path.basename(sibling), new URLSearchParams()), { status: 403 });
  const standalone = await service.register(path.join(root, 'one.jsonl'));
  await assert.rejects(service.file(standalone.id, 'nested/two.jsonl', new URLSearchParams()), { status: 403 });
  await assert.rejects(service.tree(standalone.id), { status: 403 });
  assert.equal(isWithin(root, `${root}-sibling`), false);
  await assert.rejects(service.register('relative.jsonl'), { status: 400 });
});

test('junction or symbolic directory outside root cannot be traversed', async () => {
  const root = path.join(directory, 'links');
  const outside = path.join(directory, 'outside');
  await mkdir(root);
  await mkdir(outside);
  await writeFile(path.join(outside, 'private.jsonl'), record('synthetic private'));
  await symlink(outside, path.join(root, 'escape'), process.platform === 'win32' ? 'junction' : 'dir');
  const service = new ViewerService();
  const source = await service.register(root);
  assert.deepEqual((await service.tree(source.id)).entries, []);
  await assert.rejects(service.file(source.id, 'escape/private.jsonl', new URLSearchParams()), { status: 403 });
});

test('revision invalidates on append, same-length rewrite, truncation, deletion and stale raw request', async () => {
  const service = new ViewerService();
  const file = await fixture(record('original'));
  const source = await service.register(file);
  const first = await service.file(source.id, '', new URLSearchParams());
  assert.equal((await service.raw(source.id, '', 1, first.revision)).raw, record('original'));
  await writeFile(file, record('rewrites'));
  const second = await service.file(source.id, '', new URLSearchParams());
  assert.notEqual(second.revision, first.revision);
  assert.equal(second.events[0].text, 'rewrites');
  await assert.rejects(service.raw(source.id, '', 1, first.revision), { status: 409 });
  await appendFile(file, `\n${record('added')}`);
  assert.equal((await service.file(source.id, '', new URLSearchParams())).totalEvents, 2);
  await writeFile(file, '');
  assert.equal((await service.file(source.id, '', new URLSearchParams())).totalEvents, 0);
  await rm(file);
  assert.deepEqual(await service.revision(source.id, ''), { revision: '', exists: false });
});

test('raw preserves an unknown record and malformed lines', async () => {
  const service = new ViewerService();
  const file = await fixture('{"unknown":{"nested":[1,2]}}\n{malformed}');
  const source = await service.register(file);
  const view = await service.file(source.id, '', new URLSearchParams());
  assert.equal((await service.raw(source.id, '', 1, view.revision)).raw, '{"unknown":{"nested":[1,2]}}');
  assert.equal((await service.raw(source.id, '', 2, view.revision)).raw, '{malformed}');
});

test('HTTP rejects hostile Host, Origin, missing marker and methods; API endpoints work', async () => {
  const service = new ViewerService();
  const server = createServer(createHandler(service));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const port = address.port;
  const send = (route: string, options: { headers?: Record<string, string>; method?: string; body?: string } = {}) => new Promise<{ status: number; body: any; headers: Record<string, unknown> }>((resolve, reject) => {
    const request = httpRequest({ hostname: '127.0.0.1', port, path: route, method: options.method ?? 'GET', headers: { 'X-Viewer-Request': '1', ...options.headers } }, response => {
      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => resolve({ status: response.statusCode!, body: JSON.parse(data), headers: response.headers }));
    });
    request.on('error', reject);
    request.end(options.body);
  });
  try {
    assert.equal((await send('/api/config', { headers: { Host: `evil.test:${port}` } })).status, 403);
    assert.equal((await send('/api/config', { headers: { Origin: 'https://evil.test' } })).status, 403);
    assert.equal((await send('/api/config', { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
    assert.equal((await send('/api/config', { headers: { 'X-Viewer-Request': '' } })).status, 403);
    assert.equal((await send('/api/config', { method: 'POST' })).status, 405);
    assert.equal((await send('/api/sources', { method: 'OPTIONS' })).status, 405);
    const config = await send('/api/config', { headers: { Origin: `http://127.0.0.1:${port}` } });
    assert.equal(config.status, 200);
    assert.equal(config.headers['access-control-allow-origin'], undefined);
    assert.equal(config.headers['cache-control'], 'no-store');
    const file = await fixture(record('HTTP content'));
    const registered = await send('/api/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: file }) });
    assert.equal(registered.status, 200);
    const view = await send(`/api/file?source=${registered.body.id}`);
    assert.equal(view.body.events[0].text, 'HTTP content');
    assert.equal((await send(`/api/raw?source=${registered.body.id}&line=1&revision=${view.body.revision}`)).status, 200);
    assert.equal((await send('/api/sources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(17000) })).status, 413);
  } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
});
