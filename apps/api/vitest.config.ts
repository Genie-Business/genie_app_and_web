import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    // Integration suites hit a remote Neon database over the public internet;
    // a heavy end-to-end test (gift payment → order → delivery) can string
    // together dozens of round-trips.
    testTimeout: 60_000,
    hookTimeout: 45_000,
    // Integration suites share one database and TRUNCATE between tests — they
    // must not run concurrently.
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
