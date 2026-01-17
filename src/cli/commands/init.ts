import { Command } from 'commander';
import * as path from 'path';
import { discoverPebbleDir, ensurePebbleDir } from '../lib/storage.js';

export function initCommand(program: Command): void {
  program
    .command('init')
    .description('Initialize a new .pebble directory in the current directory')
    .option('--force', 'Re-initialize even if .pebble already exists')
    .action((options) => {
      const existing = discoverPebbleDir();

      if (existing && !options.force) {
        console.error(JSON.stringify({
          error: 'Already initialized',
          path: existing,
          hint: 'Use --force to re-initialize',
        }));
        process.exit(1);
      }

      // Create .pebble in current directory
      const pebbleDir = ensurePebbleDir(process.cwd());

      console.log(JSON.stringify({
        initialized: true,
        path: pebbleDir,
        configPath: path.join(pebbleDir, 'config.json'),
        issuesPath: path.join(pebbleDir, 'issues.jsonl'),
      }));
    });
}
