import { Command } from 'commander';
import { getOrCreatePebbleDir } from '../lib/storage.js';
import { getBlocked } from '../lib/state.js';
import { outputIssueList, outputError } from '../lib/output.js';

export function blockedCommand(program: Command): void {
  program
    .command('blocked')
    .description('Show blocked issues (have open blockers)')
    .action(async () => {
      const pretty = program.opts().pretty ?? false;

      try {
        // Auto-init .pebble/ if it doesn't exist
        getOrCreatePebbleDir();

        const issues = getBlocked();
        outputIssueList(issues, pretty);
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });
}
