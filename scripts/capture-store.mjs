import { chromium, expect } from '@playwright/test';
import { mkdir, mkdtemp, readFile, writeFile, copyFile } from 'node:fs/promises';
import path from 'node:path';

const output = path.resolve('docs/extension/store');
await mkdir(output, { recursive: true });
await mkdir('.local/store-capture', { recursive: true });
const profile = await mkdtemp(path.resolve('.local/store-capture/profile-'));
const extension = path.resolve('dist/extension');
const samples = await Promise.all([
  'atlas/session-auth.jsonl', 'atlas/subagents/review-session.jsonl', 'ledger/session-export.jsonl',
].map(async name => ({ name, content: await readFile(path.join('samples', name), 'utf8') })));
const context = await chromium.launchPersistentContext(profile, {
  headless: true, channel: 'chromium', executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
  viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1,
});
try {
  const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`chrome-extension://${new URL(worker.url()).host}/index.html`);
  await page.evaluate(async samples => {
    const root = await navigator.storage.getDirectory();
    const logs = await root.getDirectoryHandle('demo-projects', { create: true });
    for (const sample of samples) {
      const parts = sample.name.split('/'); const name = parts.pop(); let directory = logs;
      for (const part of parts) directory = await directory.getDirectoryHandle(part, { create: true });
      const file = await directory.getFileHandle(name, { create: true });
      const writer = await file.createWritable(); await writer.write(sample.content); await writer.close();
    }
    window.showDirectoryPicker = async () => logs;
  }, samples);
  await page.getByRole('button', { name: '폴더 연결', exact: true }).click();
  await page.getByRole('treeitem', { name: 'atlas', exact: true }).click();
  await page.getByRole('treeitem', { name: 'session-auth.jsonl', exact: true }).click();
  await expect(page.locator('.event-card')).toHaveCount(11);
  await page.getByLabel('화면 테마').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: path.join(output, '01-dark-tree.png') });
  await page.getByLabel('화면 테마').selectOption('light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.screenshot({ path: path.join(output, '02-light-tree.png') });
  const titles = page.getByRole('group', { name: /기록 제목/ });
  await titles.getByRole('button', { name: '선택 해제', exact: true }).click();
  await titles.getByRole('button', { name: /^도구 호출/ }).click();
  await titles.getByRole('button', { name: /^도구 결과/ }).click();
  await expect(page.locator('.event-card')).toHaveCount(4);
  await page.getByLabel('화면 테마').selectOption('dark');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: path.join(output, '03-title-filters.png') });
  if (errors.length) throw new Error(errors.join('\n'));

  const promotion = await context.newPage();
  await promotion.setViewportSize({ width: 440, height: 280 });
  await promotion.setContent(`<!doctype html><html lang="ko"><meta charset="utf-8"><style>
    * { box-sizing: border-box } body { margin:0; background:#235d4b; color:#f4faf6; font-family:'Segoe UI','Malgun Gothic',sans-serif; }
    main { width:440px; height:280px; padding:34px 32px; display:flex; flex-direction:column; justify-content:space-between; }
    .mark { width:48px; height:48px; display:grid; place-items:center; color:#235d4b; background:#e7f0eb; border-radius:9px; font:700 28px Consolas,monospace; }
    h1 { font-size:31px; line-height:1.15; letter-spacing:-1px; margin:0 0 12px; }
    p { font-size:15px; margin:0; color:#d6ece0; } footer { border-top:1px solid #64917c; padding-top:14px; font-size:12px; color:#d6ece0; }
    </style><main><div class="mark" aria-hidden="true">[/]</div><div><h1>CC JSONL Monitor</h1><p>Claude Code 기록, 흐름대로 읽기</p></div><footer>폴더 연결 · 파일 트리 · 다크모드</footer></main></html>`);
  await promotion.screenshot({ path: path.join(output, 'promo-440x280.png') });
  await copyFile('extension/icons/128.png', path.join(output, 'icon-128.png'));
  await writeFile(path.join(output, 'assets.json'), JSON.stringify({
    extensionVersion: JSON.parse(await readFile('extension/manifest.json', 'utf8')).version, screenshotSize: [1280,800], promotionSize: [440,280],
    source: 'Packaged extension with synthetic samples only; native chooser replaced for capture.',
    screenshots: ['01-dark-tree.png','02-light-tree.png','03-title-filters.png'],
    promotion: 'promo-440x280.png', icon: 'icon-128.png',
  }, null, 2) + '\n');
  console.log(output);
} finally { await context.close(); }
