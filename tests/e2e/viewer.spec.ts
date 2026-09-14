import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile, readFile, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const fixtureRoot = path.resolve('.local/e2e');
const folder = path.join(fixtureRoot, 'workspace');
const transcript = path.join(folder, '세션 기록.jsonl');
const rawRecords = [
  { type: 'user', sessionId: 'test-session', cwd: 'D:\\workspace', timestamp: '2026-09-14T10:00:00+09:00', message: { content: '<img src=x onerror=alert(1)> 로그인 오류를 확인해줘.' } },
  { type: 'assistant', sessionId: 'test-session', cwd: 'D:\\workspace', timestamp: '2026-09-14T10:00:01+09:00', message: { content: [{ type: 'tool_use', id: 'tool-test', name: 'Bash', input: { command: 'npm test' } }] } },
  { type: 'user', sessionId: 'test-session', cwd: 'D:\\workspace', timestamp: '2026-09-14T10:00:02+09:00', message: { content: [{ type: 'tool_result', tool_use_id: 'tool-test', is_error: true, content: 'retry needed: expected /login, received /home' }] } },
  { type: 'assistant', sessionId: 'test-session', cwd: 'D:\\workspace', timestamp: '2026-09-14T10:01:00+09:00', message: { content: '실패한 테스트를 확인했습니다.' } },
];
const fixtureContent = rawRecords.map((record) => JSON.stringify(record)).join('\n') + '\n';

test.beforeAll(async () => {
  await mkdir(folder, { recursive: true });
  await writeFile(transcript, fixtureContent);
  await writeFile(path.join(folder, 'empty.jsonl'), '');
  await writeFile(path.join(folder, 'ignored.txt'), 'Not a transcript.');
});

async function openPath(page: Page, target: string) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: '경로 열기', exact: true })).toBeEnabled();
  await page.getByLabel('기준 경로', { exact: true }).fill(target);
  await page.getByRole('button', { name: '경로 열기', exact: true }).click();
}

test('opens directory tree and selected JSONL on the right without executing log HTML', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openPath(page, fixtureRoot);
  await page.getByRole('treeitem', { name: 'workspace', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'workspace', exact: true })).toBeVisible();
  await page.getByRole('treeitem', { name: '세션 기록.jsonl', exact: true }).click();
  await expect(page.locator('.event-card')).toHaveCount(4);
  await expect(page.getByRole('heading', { name: '세션 기록.jsonl', exact: true })).toBeVisible();
  await expect(page.locator('.event-body').first()).toContainText('<img src=x onerror=alert(1)>');
  await expect(page.locator('.event-body img')).toHaveCount(0);
  await expect(page.getByRole('treeitem', { name: 'ignored.txt', exact: true })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('filters, searches, sorts, and fetches original lines', async ({ page }) => {
  await openPath(page, transcript);
  await expect(page.locator('.event-card')).toHaveCount(4);
  await page.getByLabel('이벤트 종류', { exact: true }).selectOption('error');
  await expect(page.locator('.event-card')).toHaveCount(1);
  await expect(page.locator('.event-body')).toContainText('retry needed');
  await page.getByLabel('이벤트 종류', { exact: true }).selectOption('all');
  await page.getByLabel('선택한 파일에서 검색').fill('no-match-123');
  await expect(page.getByRole('heading', { name: '조건에 맞는 기록이 없습니다' })).toBeVisible();
  await page.getByRole('button', { name: '검색·필터 초기화', exact: true }).click();
  await expect(page.locator('.event-card')).toHaveCount(4);
  await page.getByLabel('시간 정렬', { exact: true }).selectOption('desc');
  await expect(page.locator('.event-body').first()).toContainText('실패한 테스트를 확인했습니다.');
  await page.locator('.raw-toggle').first().click();
  await expect(page.locator('.raw-record pre')).toContainText('test-session');
  await expect(page.locator('.raw-record pre')).toContainText('2026-09-14T10:01:00+09:00');
  await expect(page.getByRole('treeitem')).toHaveCount(1);
});

test('reports invalid paths and empty files with recovery', async ({ page }) => {
  await openPath(page, 'relative/path.jsonl');
  await expect(page.locator('#path-error')).toContainText('절대 경로');
  await page.getByLabel('기준 경로', { exact: true }).fill(path.join(folder, 'missing.jsonl'));
  await page.getByRole('button', { name: '경로 열기', exact: true }).click();
  await expect(page.locator('#path-error')).toBeVisible();
  await page.getByLabel('기준 경로', { exact: true }).fill(path.join(folder, 'empty.jsonl'));
  await page.getByRole('button', { name: '경로 열기', exact: true }).click();
  await expect(page.getByRole('heading', { name: '표시할 기록이 없습니다' })).toBeVisible();
});

test('keeps the old view until an observed file change is applied', async ({ page }) => {
  const watchedFile = path.join(folder, 'watched.jsonl');
  await writeFile(watchedFile, fixtureContent);
  await openPath(page, watchedFile);
  await expect(page.locator('.event-card')).toHaveCount(4);
  await appendFile(watchedFile, JSON.stringify({ type: 'assistant', sessionId: 'test-session', timestamp: '2026-09-14T10:02:00+09:00', message: { content: '추가된 기록입니다.' } }) + '\n');
  await expect(page.locator('.update-banner')).toBeVisible({ timeout: 12_000 });
  await expect(page.locator('.event-card')).toHaveCount(4);
  await page.getByRole('button', { name: '다시 읽기', exact: true }).click();
  await expect(page.locator('.event-card')).toHaveCount(5);
  await expect(page.getByText('추가된 기록입니다.', { exact: true })).toBeVisible();
});

test('file reads leave original bytes unchanged and narrow screens do not overflow', async ({ page }) => {
  const before = createHash('sha256').update(await readFile(transcript)).digest('hex');
  await openPath(page, transcript);
  await expect(page.locator('.event-card')).toHaveCount(4);
  await page.locator('.raw-toggle').first().click();
  await expect(page.locator('.raw-record pre')).toBeVisible();
  const after = createHash('sha256').update(await readFile(transcript)).digest('hex');
  expect(after).toBe(before);
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => document.documentElement.style.zoom = '2');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('handles folders named like inherited JavaScript properties', async ({ page }) => {
  for (const name of ['constructor', '__proto__', 'toString']) {
    const specialFolder = path.join(fixtureRoot, name);
    await mkdir(specialFolder, { recursive: true });
    await writeFile(path.join(specialFolder, `${name}.jsonl`), fixtureContent);
  }
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await openPath(page, fixtureRoot);
  for (const name of ['constructor', '__proto__', 'toString']) {
    await page.getByRole('treeitem', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
    await page.getByRole('treeitem', { name: `${name}.jsonl`, exact: true }).click();
    await expect(page.locator('.event-card')).toHaveCount(4);
  }
  expect(errors).toEqual([]);
});