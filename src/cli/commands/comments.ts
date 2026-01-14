import { Command } from 'commander';
import type { CommentEvent } from '../../shared/types.js';
import { getOrCreatePebbleDir, appendEvent } from '../lib/storage.js';
import { getIssue, resolveId } from '../lib/state.js';
import { outputMutationSuccess, outputError } from '../lib/output.js';

export function commentsCommand(program: Command): void {
  const comments = program
    .command('comments')
    .description('Manage comments');

  // comments add <id> <text>
  comments
    .command('add <id> <text>')
    .description('Add a comment to an issue')
    .action(async (id: string, text: string) => {
      const pretty = program.opts().pretty ?? false;

      try {
        const pebbleDir = getOrCreatePebbleDir();
        const resolvedId = resolveId(id);
        const issue = getIssue(resolvedId);

        if (!issue) {
          throw new Error(`Issue not found: ${id}`);
        }

        const timestamp = new Date().toISOString();
        const event: CommentEvent = {
          type: 'comment',
          issueId: resolvedId,
          timestamp,
          data: {
            text,
            timestamp,
          },
        };

        appendEvent(event, pebbleDir);

        outputMutationSuccess(resolvedId, pretty);
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });
}
