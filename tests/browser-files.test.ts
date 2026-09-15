import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserFiles, blobLines, type LocalDirectory, type LocalFile, type Handle } from '../src/browser/filesystem';
import { parseLines, LIMITS } from '../shared/parser';
const records = [
  { type: 'user', timestamp: '2026-09-14T01:00:00Z', sessionId: 's', message: { content: '요청' } },
  { type: 'assistant', timestamp: '2026-09-14T01:00:01Z', sessionId: 's', message: { content: [{ type: 'tool_use', id: 't', name: 'Read', input: { file: 'hello.txt' } }] } },
  { type: 'user', timestamp: '2026-09-14T01:00:02Z', sessionId: 's', message: { content: [{ type: 'tool_result', tool_use_id: 't', is_error: true, content: '도구 결과' }] } },
  { type: 'future-record', timestamp: '2026-09-14T01:00:03Z', sessionId: 's', content: '미지원' },
];
const text = records.map(record => JSON.stringify(record)).join('\n') + '\n';
function fixture() {
  let permission: PermissionState = 'granted';
  let current: File | null = new File([text], 'session.jsonl', { lastModified: 10 });
  const permissions = { queryPermission: async () => permission, requestPermission: async () => permission, isSameEntry: async () => false };
  const file: LocalFile = { ...permissions, name: 'session.jsonl', kind: 'file', getFile: async () => {
    if (!current) throw new DOMException('missing', 'NotFoundError'); return current;
  } };
  const ignored: LocalFile = { ...file, name: 'note.txt' };
  const dir: LocalDirectory = { ...permissions, kind: 'directory', name: 'logs',
    async *values() { yield file; yield ignored; },
    getDirectoryHandle: async () => { throw new DOMException('missing', 'NotFoundError'); },
    getFileHandle: async (name) => { if (name === file.name) return file; throw new DOMException('missing', 'NotFoundError'); },
  };
  return { file, dir, deny: () => { permission = 'denied'; }, replace: (value: File | null) => { current = value; } };
}

test('browser stream handles byte boundaries, BOM, CRLF, malformed lines and pending tail', async () => {
  const bytes = new TextEncoder().encode('\uFEFF' + text.replaceAll('\n', '\r\n') + 'bad\r\n{"type":');
  const blob = new Blob([bytes]);
  Object.defineProperty(blob, 'stream', { value: () => new ReadableStream({ start(controller) {
    for (let i = 0; i < bytes.length; i += 7) controller.enqueue(bytes.slice(i, i + 7)); controller.close();
  } }) });
  const parsed = await parseLines(blobLines(blob), 'test');
  assert.equal(parsed.events.length, 4);
  assert.equal(parsed.events[0].text, '요청');
  assert.equal(parsed.events[2].linkState, 'linked');
  assert.equal(parsed.diagnostics.length, 1);
  assert.equal(parsed.pendingTail, true);
  await assert.rejects(async () => { for await (const _ of blobLines(new Blob(['x'.repeat(LIMITS.lineBytes + 1)]))) {} }, /512 KiB/);
});

test('browser folder access rejects traversal, denied permissions and standalone siblings', async () => {
  const f = fixture(); const service = new BrowserFiles(); service.register('root', f.dir);
  assert.deepEqual((await service.tree('root', '')).entries.map(entry => entry.name), ['session.jsonl']);
  for (const path of ['../secret.jsonl', 'C:\\secret.jsonl', '/etc/test.jsonl', 'sub/../session.jsonl']) await assert.rejects(service.entry('root', path));
  f.deny(); await assert.rejects(service.file('root', 'session.jsonl', new URLSearchParams()), /권한/);
  const next = fixture(); service.register('single', next.file);
  await assert.rejects(service.file('single', 'sibling.jsonl', new URLSearchParams()), /선택한 파일/);
  service.clear(); await assert.rejects(service.tree('single', ''), /연결이 해제/);
});

test('title selections combine with search, error filters and empty selections', async () => {
  const f = fixture(); const service = new BrowserFiles(); service.register('root', f.dir);
  const query = (value: string) => service.file('root', 'session.jsonl', new URLSearchParams(value));
  assert.deepEqual((await query('titles=tool_use,tool_result')).events.map(event => event.kind), ['tool_use', 'tool_result']);
  assert.equal((await query('titles=unknown')).events[0].text, '미지원');
  assert.equal((await query('titles=')).matchedEvents, 0);
  assert.equal((await query('titles=tool_use,tool_result&kind=error')).matchedEvents, 1);
  assert.equal((await query('titles=tool_use,tool_result&q=Read&order=desc&limit=1')).events[0].kind, 'tool_result');
  assert.equal((await query('titles=unknown&from=2026-09-15&timezone=utc')).matchedEvents, 0);
  await assert.rejects(query('titles=bad'), /지원하지 않는/);
});

test('browser snapshots invalidate on append, truncate, rewrite and deletion; raw rejects stale revision', async () => {
  const f = fixture(); const service = new BrowserFiles(); service.register('single', f.file);
  const first = await service.file('single', '', new URLSearchParams());
  assert.equal((await service.raw('single', '', 1, first.revision)).raw, JSON.stringify(records[0]));
  f.replace(new File([text + JSON.stringify({ type: 'system', content: 'added' })], 'session.jsonl', { lastModified: 11 }));
  assert.equal((await service.file('single', '', new URLSearchParams())).totalEvents, 5);
  await assert.rejects(service.raw('single', '', 1, first.revision), /변경/);
  f.replace(new File([text.replace('hello.txt', 'world.txt')], 'session.jsonl', { lastModified: 12 }));
  assert.match((await service.file('single', '', new URLSearchParams('titles=tool_use'))).events[0].text, /world.txt/);
  f.replace(new File([], 'session.jsonl', { lastModified: 13 }));
  assert.equal((await service.file('single', '', new URLSearchParams())).totalEvents, 0);
  f.replace(null); assert.equal((await service.revision('single', '')).exists, false);
});

test('browser entry lookup supports directory names with .jsonl suffix and inherited names', async () => {
  const f = fixture();
  const child = { ...f.dir, name: 'constructor.jsonl' };
  const root: LocalDirectory = { ...f.dir,
    async *values() { yield child; },
    getFileHandle: async () => { throw new DOMException('directory', 'TypeMismatchError'); },
    getDirectoryHandle: async (name) => { assert.equal(name, child.name); return child; },
  };
  const service = new BrowserFiles(); service.register('root', root);
  assert.equal((await service.entry('root', 'constructor.jsonl')).kind, 'directory');
  assert.equal((await service.tree('root', 'constructor.jsonl')).entries[0].kind, 'file');
});
