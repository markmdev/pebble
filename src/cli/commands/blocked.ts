import { Command } from 'commander';
import { getOrCreatePebbleDir } from '../lib/storage.js';
import { getBlocked, getBlocking, getChildren, getVerifications, getBlockers, getIssue } from '../lib/state.js';
import { outputIssueList, outputIssueListVerbose, outputError, type VerboseIssueInfo, type LimitInfo } from '../lib/output.js';

export function blockedCommand(program: Command): void {
  program
    .command('blocked')
    .description('Show blocked issues (have open blockers)')
    .option('-v, --verbose', 'Show expanded details including WHY each issue is blocked')
    .option('--limit <n>', 'Max issues to return (default: 30)')
    .option('--all', 'Show all issues (no limit)')
    .action(async (options) => {
      const pretty = program.opts().pretty ?? false;

      try {
        // Auto-init .pebble/ if it doesn't exist
        getOrCreatePebbleDir();

        let issues = getBlocked();

        // Sort by createdAt descending (newest first)
        issues.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        // Apply limit
        const total = issues.length;
        const limit = options.all ? 0 : (options.limit ? parseInt(options.limit, 10) : 30);
        if (limit > 0 && issues.length > limit) {
          issues = issues.slice(0, limit);
        }
        const limitInfo: LimitInfo = {
          total,
          shown: issues.length,
          limited: limit > 0 && total > limit,
        };

        if (options.verbose) {
          // Build verbose info for each issue, including open blockers
          const verboseIssues: VerboseIssueInfo[] = issues.map((issue) => {
            // Get open blockers (issues blocking this one that aren't closed)
            const allBlockers = getBlockers(issue.id);
            const openBlockers = allBlockers
              .filter((b) => b.status !== 'closed')
              .map((b) => b.id);

            const info: VerboseIssueInfo = {
              issue,
              blocking: getBlocking(issue.id).map((i) => i.id),
              children: getChildren(issue.id).length,
              verifications: getVerifications(issue.id).length,
              blockers: openBlockers,
            };

            // Add parent info if available
            if (issue.parent) {
              const parentIssue = getIssue(issue.parent);
              if (parentIssue) {
                info.parent = { id: parentIssue.id, title: parentIssue.title };
              }
            }

            return info;
          });
          outputIssueListVerbose(verboseIssues, pretty, 'Blocked Issues', limitInfo);
        } else {
          outputIssueList(issues, pretty, limitInfo);
        }
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });
}
