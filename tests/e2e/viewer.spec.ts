import { test, expect, type Page } from '@playwright/test';
import { mkdir, writeFile, readFile, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

async function revealControls(page: Page, label: string) {
  const toggle = page.getByRole('button', { name: new RegExp('^' + label) });
  if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
}

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
  await revealControls(page, '연결 관리');
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

test('filters, searches, sorts, and displays readable content', async ({ page }) => {
  await openPath(page, transcript);
  await expect(page.locator('.event-card')).toHaveCount(4);
  await revealControls(page, '필터·설정');
  await page.getByLabel('오류 필터', { exact: true }).selectOption('error');
  await expect(page.locator('.event-card')).toHaveCount(1);
  await expect(page.locator('.event-body')).toContainText('retry needed');
  await revealControls(page, '필터·설정');
  await page.getByLabel('오류 필터', { exact: true }).selectOption('all');
  await page.getByLabel('선택한 파일에서 검색').fill('no-match-123');
  await expect(page.getByRole('heading', { name: '조건에 맞는 기록이 없습니다' })).toBeVisible();
  await page.getByRole('button', { name: '검색·필터 초기화', exact: true }).click();
  await expect(page.locator('.event-card')).toHaveCount(4);
  await page.getByLabel('시간 정렬', { exact: true }).selectOption('desc');
  await expect(page.locator('.event-body').first()).toContainText('실패한 테스트를 확인했습니다.');
  await expect(page.locator('.raw-toggle, .raw-record')).toHaveCount(0);
  await expect(page.locator('.event-session').first()).toContainText('test-session');
  await expect(page.getByRole('treeitem')).toHaveCount(1);
});

test('reports invalid paths and empty files with recovery', async ({ page }) => {
  await openPath(page, 'relative/path.jsonl');
  await expect(page.locator('#path-error')).toContainText('절대 경로');
  await revealControls(page, '연결 관리');
  await page.getByLabel('기준 경로', { exact: true }).fill(path.join(folder, 'missing.jsonl'));
  await page.getByRole('button', { name: '경로 열기', exact: true }).click();
  await expect(page.locator('#path-error')).toBeVisible();
  await revealControls(page, '연결 관리');
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
  await expect(page.locator('.event-details')).toContainText('npm test');
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
test('supplemental records use readable fields and new filters in server mode', async ({ page }) => {
  await openPath(page, path.resolve('samples/atlas/record-patterns.jsonl'));
  await expect(page.locator('.event-card')).toHaveCount(10);
  await revealControls(page, '필터·설정');
  const titles = page.getByRole('group', { name: /기록 제목/ });
  await revealControls(page, '필터·설정');
  await titles.getByRole('button', { name: '선택 해제', exact: true }).click();
  await revealControls(page, '필터·설정');
  await titles.getByRole('button', { name: /^대화 요약/ }).click();
  await expect(page.locator('.event-card')).toHaveCount(3);
  await page.getByLabel('선택한 파일에서 검색').fill('압축');
  await expect(page.locator('.event-card')).toHaveCount(1);
  await expect(page.locator('.event-details')).toContainText('12');
  await expect(page.locator('.raw-toggle, .raw-record')).toHaveCount(0);
});

test('keeps filters across files, folders and new roots including missing selected sessions', async ({ page }) => {
  const first = path.join(folder, 'filter-first.jsonl');
  const second = path.join(folder, 'filter-second.jsonl');
  await mkdir(path.join(folder, 'filter-folder'), { recursive: true });
  await writeFile(first, fixtureContent + JSON.stringify({ type: 'assistant', sessionId: 'another-session', content: 'second session' }) + '\n');
  await writeFile(second, fixtureContent.replaceAll('test-session', 'different-session'));
  await openPath(page, folder);
  await page.getByRole('treeitem', { name: 'filter-first.jsonl', exact: true }).click();
  await expect(page.locator('.event-card')).toHaveCount(5);
  await revealControls(page, '필터·설정');
  const titles = page.getByRole('group', { name: /기록 제목/ });
  await revealControls(page, '필터·설정');
  await titles.getByRole('button', { name: '선택 해제', exact: true }).click();
  await revealControls(page, '필터·설정');
  await titles.getByRole('button', { name: /^도구 결과/ }).click();
  await revealControls(page, '필터·설정');
  await page.getByLabel('오류 필터', { exact: true }).selectOption('error');
  await page.getByLabel('선택한 파일에서 검색').fill('retry');
  await revealControls(page, '필터·설정');
  await page.getByLabel('시작일').fill('2026-09-14');
  await revealControls(page, '필터·설정');
  await page.getByLabel('종료일').fill('2026-09-14');
  await revealControls(page, '필터·설정');
  await page.getByLabel('표시 시간대').selectOption('utc');
  await page.getByLabel('시간 정렬', { exact: true }).selectOption('desc');
  await revealControls(page, '필터·설정');
  await page.getByLabel('세션 필터').selectOption('test-session');
  await page.getByRole('button', { name: '목록형', exact: true }).click();
  await expect(page.locator('.event-card')).toHaveCount(1);
  await page.getByRole('treeitem', { name: 'filter-folder', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'filter-folder', exact: true })).toBeVisible();
  await page.getByRole('treeitem', { name: 'filter-second.jsonl', exact: true }).click();
  await expect(page.getByRole('heading', { name: '조건에 맞는 기록이 없습니다' })).toBeVisible();
  await revealControls(page, '필터·설정');
  await expect(page.getByLabel('세션 필터')).toHaveValue('test-session');
  await revealControls(page, '필터·설정');
  await expect(page.getByLabel('세션 필터')).toContainText('이 파일에 없음');
  await expect(page.getByLabel('선택한 파일에서 검색')).toHaveValue('retry');
  await revealControls(page, '필터·설정');
  await expect(page.getByLabel('오류 필터', { exact: true })).toHaveValue('error');
  await revealControls(page, '필터·설정');
  await expect(page.getByLabel('시작일')).toHaveValue('2026-09-14');
  await revealControls(page, '필터·설정');
  await expect(page.getByLabel('종료일')).toHaveValue('2026-09-14');
  await revealControls(page, '필터·설정');
  await expect(page.getByLabel('표시 시간대')).toHaveValue('utc');
  await expect(page.getByLabel('시간 정렬', { exact: true })).toHaveValue('desc');
  await revealControls(page, '필터·설정');
  await expect(titles.getByRole('button', { name: /^도구 결과/ })).toHaveAttribute('aria-pressed', 'true');
  await revealControls(page, '필터·설정');
  await expect(titles.getByRole('button', { name: /^도구 호출/ })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('button', { name: '목록형', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await revealControls(page, '연결 관리');
  await page.getByLabel('기준 경로', { exact: true }).fill(first);
  await page.getByRole('button', { name: '경로 열기', exact: true }).click();
  await expect(page.locator('.event-card')).toHaveCount(1);
  await expect(page.getByLabel('선택한 파일에서 검색')).toHaveValue('retry');
  await page.getByRole('button', { name: '초기화', exact: true }).click();
  await expect(page.locator('.event-card')).toHaveCount(5);
  await revealControls(page, '필터·설정');
  await page.getByLabel('시작일').fill('2026-09-16');
  await revealControls(page, '필터·설정');
  await page.getByLabel('종료일').fill('2026-09-14');
  await revealControls(page, '연결 관리');
  await page.getByLabel('기준 경로', { exact: true }).fill(second);
  await page.getByRole('button', { name: '경로 열기', exact: true }).click();
  await expect(page.getByText('기간을 수정하면 기록을 표시합니다.', { exact: true })).toBeVisible();
});

test('conversation view aligns speakers, collapses work and retains a readable list alternative', async ({ page }) => {
  const clean = path.join(folder, 'conversation.jsonl');
  await writeFile(clean, fixtureContent.replace('"is_error":true', '"is_error":false'));
  await openPath(page, clean);
  await expect(page.locator('.conversation-list')).toBeVisible();
  await expect(page.locator('.conversation-list > .event-user')).toBeVisible();
  await expect(page.locator('.conversation-list > .event-assistant')).toBeVisible();
  const work = page.locator('.activity-group');
  await expect(work).toHaveCount(1);
  await expect(work.locator('.event-tool_use')).not.toBeVisible();
  await work.locator('summary').click();
  await expect(work.locator('.event-tool_use')).toBeVisible();
  await expect(work.locator('.event-tool_result')).toBeVisible();
  await page.getByRole('button', { name: '목록형', exact: true }).click();
  await expect(page.locator('.conversation-list')).toHaveCount(0);
  await expect(page.locator('.event-tool_use')).toBeVisible();
  await page.getByRole('button', { name: '대화형', exact: true }).click();
  await page.getByLabel('선택한 파일에서 검색').fill('npm test');
  await expect(page.locator('.event-tool_use')).toBeVisible();
  await expect(page.locator('.event-card')).toHaveCount(1);
});

test('desktop layout prioritizes the transcript while keeping controls and details reachable', async ({ page }) => {
  const longName = 'workspace-session-12345678-1234-1234-1234-123456789012-long-title.jsonl';
  const longFile = path.join(folder, longName);
  await writeFile(longFile, Array.from({ length: 30 }, () => fixtureContent).join(''));
  await openPath(page, longFile);
  await expect(page.locator('.event-card')).toHaveCount(100);
  await expect(page.locator('#source-controls')).toBeHidden();
  await expect(page.locator('#advanced-filters')).toBeHidden();
  await expect(page.locator('#session-info')).toBeHidden();
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }]) {
    await page.setViewportSize(viewport);
    const metrics = await page.locator('.timeline-scroll').evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { height: rect.height, top: rect.top, ratio: rect.height / innerHeight };
    });
    expect(metrics.ratio).toBeGreaterThan(.70);
    expect(metrics.top).toBeLessThan(160);
    expect(await page.locator('.session-heading').evaluate(element => element.getBoundingClientRect().height)).toBeLessThan(55);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.locator('.timeline-scroll').evaluate(element => element.scrollTop = 400);
  await page.getByRole('button', { name: '파일 정보', exact: true }).click();
  await expect(page.locator('#session-info')).toContainText(longFile);
  await page.getByRole('button', { name: '파일 정보', exact: true }).click();
  expect(await page.locator('.timeline-scroll').evaluate(element => element.scrollTop)).toBe(400);
  await revealControls(page, '필터·설정');
  await page.getByLabel('오류 필터', { exact: true }).selectOption('error');
  await expect(page.locator('.event-card')).toHaveCount(30);
  await page.getByRole('button', { name: /^필터·설정/ }).click();
  await expect(page.locator('#advanced-filters')).toBeHidden();
  await expect(page.getByRole('button', { name: /^필터·설정/ })).toContainText('적용 중');
  await page.getByRole('button', { name: '초기화', exact: true }).click();
  await expect(page.locator('.event-card')).toHaveCount(100);
  await page.getByRole('button', { name: '다음 페이지', exact: true }).click();
  await expect(page.locator('.event-card')).toHaveCount(20);
  expect(await page.locator('.timeline-scroll').evaluate(element => element.scrollTop)).toBe(0);
  const beforeWidth = await page.locator('.timeline-scroll').evaluate(element => element.clientWidth);
  await page.getByRole('button', { name: '파일 탐색기 접기', exact: true }).click();
  expect(await page.locator('.timeline-scroll').evaluate(element => element.clientWidth)).toBeGreaterThan(beforeWidth);
  await page.getByRole('button', { name: '파일 탐색기 펼치기', exact: true }).click();
  await page.getByRole('button', { name: '이전 페이지', exact: true }).click();
  await page.getByLabel('화면 테마').selectOption('dark');
  await mkdir('.local/screenshots', { recursive: true });
  await page.screenshot({ path: '.local/screenshots/desktop-reader-dark.png' });
  await page.getByLabel('화면 테마').selectOption('light');
  await page.screenshot({ path: '.local/screenshots/desktop-reader-light.png' });
});

test('work analysis covers the full file, shows evidence and preserves reading state', async ({ page }) => {
  const file = path.join(folder, 'analysis.jsonl');
  await writeFile(file, await readFile(path.resolve('samples/atlas/work-patterns.jsonl'), 'utf8'));
  await openPath(page, file);
  await expect(page.locator('.event-card')).toHaveCount(12);
  await page.locator('.timeline-scroll').evaluate(element => element.scrollTop = 180);
  const position = await page.locator('.timeline-scroll').evaluate(element => element.scrollTop);
  await page.getByRole('button', { name: '작업 패턴', exact: true }).click();
  const analysis = page.locator('#work-analysis');
  await expect(analysis.locator('.analysis-summary')).toContainText('12개 기록');
  await expect(analysis.locator('.pattern-list > li')).toHaveCount(2);
  await expect(analysis.locator('.analysis-flows > ol > li')).toHaveCount(2);
  await expect(analysis.getByRole('heading', { name: 'Read · 오류 뒤 같은 호출' })).toBeVisible();
  await analysis.locator('.analysis-evidence summary').first().click();
  await expect(analysis.locator('.analysis-evidence').first()).toContainText('3번째 줄');
  await page.getByRole('button', { name: '대화로 돌아가기' }).click();
  expect(await page.locator('.timeline-scroll').evaluate(element => element.scrollTop)).toBe(position);
  await page.getByLabel('선택한 파일에서 검색').fill('not-present');
  await expect(page.locator('.event-card')).toHaveCount(0);
  await page.getByRole('button', { name: '작업 패턴', exact: true }).click();
  await expect(analysis.locator('.analysis-summary')).toContainText('12개 기록');
  await page.getByRole('button', { name: '대화로 돌아가기' }).click();
  await expect(page.getByLabel('선택한 파일에서 검색')).toHaveValue('not-present');
  await page.getByRole('button', { name: '초기화', exact: true }).click();
  await expect(page.locator('.event-card')).toHaveCount(12);
  await appendFile(file, JSON.stringify({ type: 'user', sessionId: 'pattern-demo', content: 'new request' }) + '\n');
  await page.getByRole('button', { name: '작업 패턴', exact: true }).click();
  await expect(analysis.getByRole('alert')).toContainText('파일이 변경');
  await page.getByRole('button', { name: '새로고침', exact: true }).click();
  await expect(analysis.locator('.analysis-summary')).toContainText('13개 기록');
});
