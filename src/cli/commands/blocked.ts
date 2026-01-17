import { Command } from 'commander';
import { getOrCreatePebbleDir } from '../lib/storage.js';
import { getBlocked, getBlocking, getChildren, getVerifications, getBlockers } from '../lib/state.js';
import { outputIssueList, outputIssueListVerbose, outputError, type VerboseIssueInfo } from '../lib/output.js';

export function blockedCommand(program: Command): void {
  program
    .command('blocked')
    .description('Show blocked issues (have open blockers)')
    .option('-v, --verbose', 'Show expanded details including WHY each issue is blocked')
    .action(async (options) => {
      const pretty = program.opts().pretty ?? false;

      try {
        // Auto-init .pebble/ if it doesn't exist
        getOrCreatePebbleDir();

        const issues = getBlocked();

        if (options.verbose) {
          // Build verbose info for each issue, including open blockers
          const verboseIssues: VerboseIssueInfo[] = issues.map((issue) => {
            // Get open blockers (issues blocking this one that aren't closed)
            const allBlockers = getBlockers(issue.id);
            const openBlockers = allBlockers
              .filter((b) => b.status !== 'closed')
              .map((b) => b.id);

            return {
              issue,
              blocking: getBlocking(issue.id).map((i) => i.id),
              children: getChildren(issue.id).length,
              verifications: getVerifications(issue.id).length,
              blockers: openBlockers,
            };
          });
          outputIssueListVerbose(verboseIssues, pretty);
        } else {
          outputIssueList(issues, pretty);
        }
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });
}
