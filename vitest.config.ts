import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    // When "projects" is set, vitest ignores root-level test options and
    // runs each project independently. We define two projects:
    //   1. "client" — React/browser tests using jsdom
    //   2. "server" — pure Node.js tests (no DOM needed)
    projects: [
      {
        plugins: [react()],
        test: {
          name: 'client',
          environment: 'jsdom',
          setupFiles: ['./src/test-setup.ts'],
          include: ['src/**/*.test.{ts,tsx}'],
          exclude: ['src/server/**/*.test.ts'],
          globals: true,
        },
        resolve: {
          alias: {
            '@': resolve(__dirname, './src'),
          },
        },
      },
      {
        test: {
          name: 'server',
          environment: 'node',
          include: ['src/server/**/*.test.ts'],
          setupFiles: ['./src/server/test-setup.ts'],
          globals: true,
        },
        resolve: {
          alias: {
            '@': resolve(__dirname, './src'),
          },
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
});
