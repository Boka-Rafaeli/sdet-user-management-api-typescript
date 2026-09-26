import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: 'tests/api',
  testMatch: '*.spec.ts',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: true,
  timeout: 30000,
  reporter: [['./src/reporter.ts']],
  grep: process.env.SCOPE === 'isolation' ? /@isolation/ : /@api/,
});
