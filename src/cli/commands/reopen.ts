import { Command } from 'commander';
import type { ReopenEvent } from '../../shared/types.js';
import { getOrCreatePebbleDir, appendEvent } from '../lib/storage.js';
import { getIssue, resolveId } from '../lib/state.js';
import { outputMutationSuccess, outputError } from '../lib/output.js';

export function reopenCommand(program: Command): void {
  program
    .command('reopen <id>')
    .description('Reopen a closed issue')
    .option('--reason <reason>', 'Reason for reopening')
    .action(async (id: string, options) => {
      const pretty = program.opts().pretty ?? false;

      try {
        const pebbleDir = getOrCreatePebbleDir();
        const resolvedId = resolveId(id);
        const issue = getIssue(resolvedId);

        if (!issue) {
          throw new Error(`Issue not found: ${id}`);
        }

        if (issue.status !== 'closed') {
          throw new Error(`Issue is not closed: ${resolvedId} (status: ${issue.status})`);
        }

        const event: ReopenEvent = {
          type: 'reopen',
          issueId: resolvedId,
          timestamp: new Date().toISOString(),
          data: {
            reason: options.reason,
          },
        };

        appendEvent(event, pebbleDir);

        // Output success
        outputMutationSuccess(resolvedId, pretty);
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });
}
