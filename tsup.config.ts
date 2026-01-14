import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli/index.ts'],
  format: ['esm'],
  target: 'node18',
  outDir: 'dist/cli',
  clean: true,
  dts: true,
  sourcemap: true,
  shims: true,
});
