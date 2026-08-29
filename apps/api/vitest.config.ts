import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 40_000,
    // Integration suites share one database and TRUNCATE between tests — they
    // must not run concurrently.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
