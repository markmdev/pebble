import { Command } from 'commander';
import { getReady } from '../lib/state.js';
import { outputIssueList, outputError } from '../lib/output.js';

export function readyCommand(program: Command): void {
  program
    .command('ready')
    .description('Show issues ready for work (no open blockers)')
    .action(async () => {
      const pretty = program.opts().pretty ?? false;

      try {
        const issues = getReady();
        outputIssueList(issues, pretty);
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });
}
