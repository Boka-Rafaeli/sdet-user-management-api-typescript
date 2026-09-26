import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.',
  testMatch: 'gate.spec.ts',
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: [['../../src/reporter.ts']],
});
