import { Command } from 'commander';
import { getOrCreatePebbleDir } from '../lib/storage.js';
import { getReady, getBlocking, getChildren, getVerifications } from '../lib/state.js';
import { outputIssueList, outputIssueListVerbose, outputError, type VerboseIssueInfo } from '../lib/output.js';

export function readyCommand(program: Command): void {
  program
    .command('ready')
    .description('Show issues ready for work (no open blockers)')
    .option('-v, --verbose', 'Show expanded details (parent, children, blocking, verifications)')
    .action(async (options) => {
      const pretty = program.opts().pretty ?? false;

      try {
        // Auto-init .pebble/ if it doesn't exist
        getOrCreatePebbleDir();

        const issues = getReady();

        if (options.verbose) {
          // Build verbose info for each issue
          const verboseIssues: VerboseIssueInfo[] = issues.map((issue) => ({
            issue,
            blocking: getBlocking(issue.id).map((i) => i.id),
            children: getChildren(issue.id).length,
            verifications: getVerifications(issue.id).length,
          }));
          outputIssueListVerbose(verboseIssues, pretty);
        } else {
          outputIssueList(issues, pretty);
        }
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });
}
