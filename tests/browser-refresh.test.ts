import test from 'node:test';
import assert from 'node:assert/strict';
import { BrowserFiles, type LocalFile } from '../src/browser/filesystem';

test('manual refresh bypasses metadata cache for equal-size, equal-mtime replacements', async () => {
  let value = JSON.stringify({ type: 'user', content: 'first' });
  const handle: LocalFile = {
    kind: 'file', name: 'session.jsonl',
    queryPermission: async () => 'granted', requestPermission: async () => 'granted', isSameEntry: async () => true,
    getFile: async () => new File([value], 'session.jsonl', { lastModified: 42 }),
  };
  const files = new BrowserFiles(); files.register('test', handle);
  assert.equal((await files.file('test', '', new URLSearchParams('refresh=0'))).events[0].text, 'first');
  value = value.replace('first', 'other');
  assert.equal((await files.file('test', '', new URLSearchParams('refresh=0'))).events[0].text, 'first');
  assert.equal((await files.file('test', '', new URLSearchParams('refresh=1'))).events[0].text, 'other');
});
