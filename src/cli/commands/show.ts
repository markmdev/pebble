import { Command } from 'commander';
import { getIssue, resolveId } from '../lib/state.js';
import { outputIssue, outputError } from '../lib/output.js';

export function showCommand(program: Command): void {
  program
    .command('show <id>')
    .description('Show issue details')
    .action(async (id: string) => {
      const pretty = program.opts().pretty ?? false;

      try {
        const resolvedId = resolveId(id);
        const issue = getIssue(resolvedId);

        if (!issue) {
          throw new Error(`Issue not found: ${id}`);
        }

        outputIssue(issue, pretty);
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });
}
