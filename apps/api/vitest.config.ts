import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    // Integration suites hit a remote Neon database over the public internet;
    // a heavy end-to-end test (gift payment → order → delivery) strings together
    // dozens of round-trips, and Neon latency varies a lot by time of day.
    testTimeout: 120_000,
    hookTimeout: 120_000,
    // Integration suites share one database and TRUNCATE between tests — they
    // must not run concurrently.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
