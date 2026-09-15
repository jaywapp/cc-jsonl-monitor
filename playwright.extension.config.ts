import { defineConfig } from '@playwright/test';
export default defineConfig({
  outputDir: '.local/extension-results',
  testDir: './tests/extension', fullyParallel: false, workers: 1, reporter: 'list',
  timeout: 30_000,
});
