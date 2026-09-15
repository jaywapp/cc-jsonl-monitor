import { test, expect, chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import { mkdtemp, mkdir } from 'node:fs/promises';

let context: BrowserContext;
let page: Page;
let url: string;
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
  await page.getByRole('button', { name: '폴더 연결', exact: true }).click();
  await page.getByRole('treeitem', { name: 'atlas', exact: true }).click();
  await page.getByRole('treeitem', { name: 'session.jsonl', exact: true }).click();
  await expect(page.locator('.event-card')).toHaveCount(4);
  await expect(page.locator('.event-body img')).toHaveCount(0);
  await page.locator('.raw-toggle').first().click();
  await expect(page.locator('.raw-record pre')).toContainText('로그인 흐름');
  expect(errors).toEqual([]); expect(network).toEqual([]);
});

test('title filters select call/result independently, combine titles, and clear all', async () => {
  const titles = page.getByRole('group', { name: /기록 제목/ });
  for (const name of ['사용자 요청', 'Claude', '생각 기록', '시스템', '미지원 기록']) await titles.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(page.locator('.event-card')).toHaveCount(2);
  await titles.getByRole('button', { name: /^도구 호출/ }).click();
  await expect(page.locator('.event-card')).toHaveCount(1);
  await expect(page.locator('.event-header strong')).toHaveText('도구 결과');
  await titles.getByRole('button', { name: /^도구 결과/ }).click();
  await expect(page.getByRole('heading', { name: '조건에 맞는 기록이 없습니다' })).toBeVisible();
  await titles.getByRole('button', { name: /^미지원 기록/ }).click();
  await expect(page.locator('.event-header strong')).toHaveText('미지원 기록');
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
  await page.getByLabel('폴더 내 경로').fill('../outside.jsonl'); await page.getByRole('button', { name: '이동', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('상위 폴더');
});

test('file picker works independently, cancellation keeps selection, forgetting does not delete originals', async () => {
  await page.evaluate(async () => {
    const logs = await (await navigator.storage.getDirectory()).getDirectoryHandle('synthetic-logs');
    const dir = await logs.getDirectoryHandle('atlas'); const file = await dir.getFileHandle('session.jsonl');
    Object.assign(window, { showOpenFilePicker: async () => [file], showDirectoryPicker: async () => { throw new DOMException('cancelled', 'AbortError'); } });
  });
  await page.getByRole('button', { name: '파일 열기', exact: true }).click();
  await expect(page.locator('.event-card')).toHaveCount(5);
  await expect(page.getByRole('treeitem')).toHaveCount(1);
  await page.getByRole('button', { name: '폴더 연결', exact: true }).click();
  await expect(page.locator('.event-card')).toHaveCount(5);
  await page.getByRole('button', { name: 'session.jsonl 연결 목록에서 제거' }).click();
  await expect(page.getByRole('heading', { name: '기록이 있는 곳부터 시작하세요.' })).toBeVisible();
  expect(await page.evaluate(async () => {
    const logs = await (await navigator.storage.getDirectory()).getDirectoryHandle('synthetic-logs');
    return (await (await (await logs.getDirectoryHandle('atlas')).getFileHandle('session.jsonl')).getFile()).size;
  })).toBeGreaterThan(0);
  expect(errors).toEqual([]); expect(network).toEqual([]);
});
