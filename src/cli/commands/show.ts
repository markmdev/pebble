import { Command } from 'commander';
import { getOrCreatePebbleDir } from '../lib/storage.js';
import { getIssue, resolveId, getBlocking } from '../lib/state.js';
import { outputIssueWithBlocking, outputError } from '../lib/output.js';

export function showCommand(program: Command): void {
  program
    .command('show <id>')
    .description('Show issue details')
    .action(async (id: string) => {
      const pretty = program.opts().pretty ?? false;

      try {
        // Auto-init .pebble/ if it doesn't exist
        getOrCreatePebbleDir();

        const resolvedId = resolveId(id);
        const issue = getIssue(resolvedId);

        if (!issue) {
          throw new Error(`Issue not found: ${id}`);
        }

        const blocking = getBlocking(resolvedId);
        outputIssueWithBlocking(issue, blocking, pretty);
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });
}
