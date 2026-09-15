import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { mkdtemp, mkdir, readFile } from 'node:fs/promises';

let context: BrowserContext;
let page: Page;
let url: string;
async function revealControls(page: Page, label: string) {
  const toggle = page.getByRole('button', { name: new RegExp('^' + label) });
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
}

const errors: string[] = [];
const network: string[] = [];
test.beforeAll(async () => {
  await mkdir('.local/extension-tests', { recursive: true });
  const profile = await mkdtemp(path.resolve('.local/extension-tests/profile-'));
  const extension = path.resolve('dist/extension');
  context = await chromium.launchPersistentContext(profile, {
    headless: true, channel: 'chromium',
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: { width: 1440, height: 1000 },
  });
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  url = `chrome-extension://${new URL(worker.url()).host}/index.html`;
  page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
  await page.goto(url);
  // Only the native chooser is substituted. Real browser handles, IndexedDB, worker
  // transfer, parsing and UI run from the packaged extension with its production CSP.
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const logs = await root.getDirectoryHandle('synthetic-logs', { create: true });
    const project = await logs.getDirectoryHandle('atlas', { create: true });
    const records = [
      { type: 'user', sessionId: 's', timestamp: '2026-09-14T01:00:00Z', cwd: 'D:/atlas', message: { content: '로그인 흐름 확인 <img src=x onerror=alert(1)>' } },
      { type: 'assistant', sessionId: 's', timestamp: '2026-09-14T01:00:01Z', message: { content: [{ type: 'tool_use', id: 't', name: 'Bash', input: { command: 'npm test' } }] } },
      { type: 'user', sessionId: 's', timestamp: '2026-09-14T01:00:02Z', message: { content: [{ type: 'tool_result', tool_use_id: 't', content: '테스트 통과' }] } },
      { type: 'future', sessionId: 's', timestamp: '2026-09-14T01:00:03Z', content: '새로운 형식' },
    ];
    const handle = await project.getFileHandle('session.jsonl', { create: true });
    const writer = await handle.createWritable(); await writer.write(records.map(record => JSON.stringify(record)).join('\n') + '\n'); await writer.close();
    Object.assign(window, { showDirectoryPicker: async () => logs, showOpenFilePicker: async () => [handle] });
  });
});
test.afterAll(async () => { await context?.close(); });

test('packaged extension connects a folder, transfers handles to its worker and reads the tree', async () => {
  await revealControls(page, '연결 관리');
  await page.getByRole('button', { name: '폴더 연결', exact: true }).click();
  await page.getByRole('treeitem', { name: 'atlas', exact: true }).click();
  await page.getByRole('treeitem', { name: 'session.jsonl', exact: true }).click();
  await expect(page.locator('.event-card')).toHaveCount(4);
  await expect(page.locator('#source-controls')).toBeHidden();
  await expect(page.locator('#advanced-filters')).toBeHidden();
  expect(await page.locator('.timeline-scroll').evaluate(element => element.getBoundingClientRect().height / innerHeight)).toBeGreaterThan(.70);
  await expect(page.locator('.event-body img')).toHaveCount(0);
  await expect(page.locator('.event-details').first()).toContainText('npm test');
  await expect(page.locator('.raw-toggle, .raw-record')).toHaveCount(0);
  expect(errors).toEqual([]); expect(network).toEqual([]);
});

test('title filters select call/result independently, combine titles, and clear all', async () => {
  await revealControls(page, '필터·설정');
  const titles = page.getByRole('group', { name: /기록 제목/ });
  await revealControls(page, '필터·설정');
  for (const name of ['사용자 요청', 'Claude', '생각 기록', '시스템', '기타 기록']) await titles.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(page.locator('.event-card')).toHaveCount(2);
  await revealControls(page, '필터·설정');
  await titles.getByRole('button', { name: /^도구 호출/ }).click();
  await expect(page.locator('.event-card')).toHaveCount(1);
  await expect(page.locator('.event-header strong')).toHaveText('도구 결과');
  await revealControls(page, '필터·설정');
  await titles.getByRole('button', { name: /^도구 결과/ }).click();
  await expect(page.getByRole('heading', { name: '조건에 맞는 기록이 없습니다' })).toBeVisible();
  await revealControls(page, '필터·설정');
  await titles.getByRole('button', { name: /^기타 기록/ }).click();
  await expect(page.locator('.event-header strong')).toHaveText('기타 기록');
  await revealControls(page, '필터·설정');
  await titles.getByRole('button', { name: '전체', exact: true }).click();
  await expect(page.locator('.event-card')).toHaveCount(4);
});

test('themes follow system, persist explicit choice, and retain contrast and layout', async () => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByLabel('화면 테마').selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await mkdir('.local/screenshots', { recursive: true });
  await page.screenshot({ path: '.local/screenshots/extension-light.png' });
  await page.getByLabel('화면 테마').selectOption('dark');
  await page.screenshot({ path: '.local/screenshots/extension-dark.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: '.local/screenshots/extension-mobile.png', fullPage: true });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.reload();
  await expect(page.getByLabel('화면 테마')).toHaveValue('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await expect(page.getByRole('treeitem', { name: 'atlas', exact: true })).toBeVisible();
});

test('restored connection supports relative paths and detects updates with manual apply', async () => {
  await revealControls(page, '연결 관리');
  await page.getByLabel('폴더 내 경로').fill('atlas/session.jsonl');
  await page.getByRole('button', { name: '이동', exact: true }).click();
  await expect(page.locator('.event-card')).toHaveCount(4);
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const logs = await root.getDirectoryHandle('synthetic-logs'); const dir = await logs.getDirectoryHandle('atlas');
    const handle = await dir.getFileHandle('session.jsonl'); const file = await handle.getFile();
    const writer = await handle.createWritable({ keepExistingData: true }); await writer.seek(file.size);
    await writer.write(JSON.stringify({ type: 'assistant', content: '추가 기록' }) + '\n'); await writer.close();
  });
  await expect(page.locator('.update-banner')).toBeVisible({ timeout: 12_000 });
  await expect(page.locator('.event-card')).toHaveCount(4);
  await page.getByRole('button', { name: '다시 읽기', exact: true }).click();
  await expect(page.locator('.event-card')).toHaveCount(5);
  await revealControls(page, '연결 관리');
  await page.getByLabel('폴더 내 경로').fill('../outside.jsonl'); await page.getByRole('button', { name: '이동', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('상위 폴더');
});

test('file picker works independently, cancellation keeps selection, forgetting does not delete originals', async () => {
  await page.evaluate(async () => {
    const logs = await (await navigator.storage.getDirectory()).getDirectoryHandle('synthetic-logs');
    const dir = await logs.getDirectoryHandle('atlas'); const file = await dir.getFileHandle('session.jsonl');
    Object.assign(window, { showOpenFilePicker: async () => [file], showDirectoryPicker: async () => { throw new DOMException('cancelled', 'AbortError'); } });
  });
  await revealControls(page, '연결 관리');
  await page.getByRole('button', { name: '파일 열기', exact: true }).click();
  await expect(page.locator('.event-card')).toHaveCount(5);
  await expect(page.getByRole('treeitem')).toHaveCount(1);
  await revealControls(page, '연결 관리');
  await page.getByRole('button', { name: '폴더 연결', exact: true }).click();
  await expect(page.locator('.event-card')).toHaveCount(5);
  await revealControls(page, '연결 관리');
  await page.getByRole('button', { name: 'session.jsonl 연결 목록에서 제거' }).click();
  await expect(page.getByRole('heading', { name: '기록이 있는 곳부터 시작하세요.' })).toBeVisible();
  expect(await page.evaluate(async () => {
    const logs = await (await navigator.storage.getDirectory()).getDirectoryHandle('synthetic-logs');
    return (await (await (await logs.getDirectoryHandle('atlas')).getFileHandle('session.jsonl')).getFile()).size;
  })).toBeGreaterThan(0);
  expect(errors).toEqual([]); expect(network).toEqual([]);
});

test('new record patterns are readable, searchable, masked, and responsive in the extension', async () => {
  const content = await readFile('samples/atlas/record-patterns.jsonl', 'utf8');
  await page.evaluate(async content => {
    const root = await navigator.storage.getDirectory();
    const handle = await root.getFileHandle('record-patterns.jsonl', { create: true });
    const writer = await handle.createWritable(); await writer.write(content); await writer.close();
    Object.assign(window, { showOpenFilePicker: async () => [handle] });
  }, content);
  await revealControls(page, '연결 관리');
  await page.getByRole('button', { name: '파일 열기', exact: true }).click();
  await expect(page.locator('.event-card')).toHaveCount(10);
  await expect(page.locator('.raw-toggle, .raw-record, .event-card pre')).toHaveCount(0);
  await revealControls(page, '필터·설정');
  const titles = page.getByRole('group', { name: /기록 제목/ });
  await revealControls(page, '필터·설정');
  await titles.getByRole('button', { name: '선택 해제', exact: true }).click();
  await revealControls(page, '필터·설정');
  await titles.getByRole('button', { name: /^기타 기록/ }).click();
  await expect(page.locator('.event-card')).toHaveCount(1);
  await page.getByRole('button', { name: /추가 항목 .*개 보기/ }).click();
  await expect(page.locator('.event-details')).toContainText('중첩된 정보도 읽을 수 있습니다.');
  await expect(page.locator('.event-details')).toContainText('[가림]');
  await expect(page.locator('.event-card')).not.toContainText('synthetic-demo-only');
  await expect(page.locator('.event-card img')).toHaveCount(0);
  await revealControls(page, '필터·설정');
  await page.getByLabel('민감 값 가리기').uncheck();
  await expect(page.locator('.event-details')).toContainText('synthetic-demo-only');
  await revealControls(page, '필터·설정');
  await page.getByLabel('민감 값 가리기').check();
  await page.getByLabel('화면 테마').selectOption('dark');
  await page.screenshot({ path: '.local/screenshots/readable-dark.png' });
  await page.getByLabel('화면 테마').selectOption('light');
  await page.screenshot({ path: '.local/screenshots/readable-light.png' });
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: '.local/screenshots/readable-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => document.documentElement.style.zoom = '2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.evaluate(() => document.documentElement.style.zoom = '1');
  await revealControls(page, '필터·설정');
  await titles.getByRole('button', { name: '전체', exact: true }).click();
  await page.getByLabel('선택한 파일에서 검색').fill('콜백');
  await expect(page.locator('.event-card')).toHaveCount(1);
  await expect(page.locator('.event-header strong')).toHaveText(['에이전트 진행 상황']);
  await page.getByLabel('선택한 파일에서 검색').fill('');
  await revealControls(page, '필터·설정');
  await titles.getByRole('button', { name: '선택 해제', exact: true }).click();
  await revealControls(page, '필터·설정');
  await titles.getByRole('button', { name: /^파일 이력/ }).click();
  await expect(page.locator('.event-card')).toHaveCount(1);
  await expect(page.locator('.event-header strong')).toHaveText(['파일 이력']);
  await expect(page.locator('.event-details')).toContainText('src/auth.ts');
  await revealControls(page, '필터·설정');
  await titles.getByRole('button', { name: '전체', exact: true }).click();
  await revealControls(page, '필터·설정');
  await page.getByLabel('오류 필터', { exact: true }).selectOption('error');
  await expect(page.locator('.event-card')).toHaveCount(1);
  await expect(page.locator('.event-header strong')).toHaveText(['훅 처리 결과']);
  expect(errors).toEqual([]); expect(network).toEqual([]);
});

test('extension keeps filters and conversation mode across file picker connections', async () => {
  await page.getByRole('button', { name: '초기화', exact: true }).click();
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    const handles = [];
    for (const name of ['chat-first.jsonl', 'chat-second.jsonl']) {
      const records = [
        { type: 'user', sessionId: 'chat-demo', timestamp: '2026-09-15T01:00:00Z', content: '로그인한 뒤 원래 화면으로 돌아가는지 확인해 주세요.' },
        { type: 'assistant', sessionId: 'chat-demo', timestamp: '2026-09-15T01:00:01Z', message: { content: [{ type: 'tool_use', id: 'read-chat', name: 'Read', input: { file_path: 'src/auth.ts' } }] } },
        { type: 'user', sessionId: 'chat-demo', timestamp: '2026-09-15T01:00:02Z', message: { content: [{ type: 'tool_result', tool_use_id: 'read-chat', content: '복귀 경로가 설정되어 있습니다.' }] } },
        { type: 'assistant', sessionId: 'chat-demo', timestamp: '2026-09-15T01:00:03Z', content: '확인했습니다. 로그인 후 원래 화면으로 돌아갑니다.' },
      ];
      const handle = await root.getFileHandle(name, { create: true });
      const writer = await handle.createWritable(); await writer.write(records.map(record => JSON.stringify(record)).join('\n')); await writer.close();
      handles.push(handle);
    }
    let index = 0;
    Object.assign(window, { showOpenFilePicker: async () => [handles[index++]] });
  });
  await revealControls(page, '연결 관리');
  await page.getByRole('button', { name: '파일 열기', exact: true }).click();
  await expect(page.locator('.event-card')).toHaveCount(4);
  await expect(page.locator('.activity-group .event-tool_use')).not.toBeVisible();
  await page.getByLabel('화면 테마').selectOption('dark');
  await page.screenshot({ path: '.local/screenshots/conversation-dark.png' });
  await page.getByLabel('화면 테마').selectOption('light');
  await page.screenshot({ path: '.local/screenshots/conversation-light.png' });
  await page.locator('.activity-group > summary').click();
  await expect(page.locator('.event-tool_use')).toBeVisible();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.screenshot({ path: '.local/screenshots/conversation-mobile.png', fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await revealControls(page, '필터·설정');
  const titles = page.getByRole('group', { name: /기록 제목/ });
  await revealControls(page, '필터·설정');
  await titles.getByRole('button', { name: '선택 해제', exact: true }).click();
  await revealControls(page, '필터·설정');
  await titles.getByRole('button', { name: /^Claude/ }).click();
  await page.getByLabel('선택한 파일에서 검색').fill('확인했습니다');
  await expect(page.locator('.event-header strong')).toHaveText(['Claude']);
  await revealControls(page, '연결 관리');
  await page.getByRole('button', { name: '파일 열기', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'chat-second.jsonl', exact: true })).toBeVisible();
  await expect(page.locator('.event-header strong')).toHaveText(['Claude']);
  await expect(page.getByLabel('선택한 파일에서 검색')).toHaveValue('확인했습니다');
  await revealControls(page, '필터·설정');
  await expect(titles.getByRole('button', { name: /^사용자 요청/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: '대화형', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]); expect(network).toEqual([]);
});
