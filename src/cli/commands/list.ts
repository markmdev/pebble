import { Command } from 'commander';
import type { IssueType, Priority, Status, IssueFilters } from '../../shared/types.js';
import { ISSUE_TYPES, PRIORITIES, STATUSES, STATUS_LABELS } from '../../shared/types.js';
import { getOrCreatePebbleDir } from '../lib/storage.js';
import { getIssues, resolveId, getBlocking, getChildren, getVerifications, getIssue } from '../lib/state.js';
import { outputIssueList, outputIssueListVerbose, outputIssueTree, outputError, type VerboseIssueInfo, type LimitInfo } from '../lib/output.js';

export function listCommand(program: Command): void {
  program
    .command('list')
    .description('List issues')
    .option('--status <status>', 'Filter by status')
    .option('-t, --type <type>', 'Filter by type')
    .option('--priority <priority>', 'Filter by priority')
    .option('--parent <id>', 'Filter by parent epic')
    .option('-v, --verbose', 'Show expanded details (parent, children, blocking, verifications)')
    .option('--flat', 'Show flat list instead of hierarchical tree')
    .option('--limit <n>', 'Max issues to return (default: 30)')
    .option('--all', 'Show all issues (no limit)')
    .action(async (options) => {
      const pretty = program.opts().pretty ?? false;

      try {
        // Auto-init .pebble/ if it doesn't exist
        getOrCreatePebbleDir();

        const filters: IssueFilters = {};

        if (options.status !== undefined) {
          const status = options.status as Status;
          if (!STATUSES.includes(status)) {
            throw new Error(`Invalid status: ${status}. Must be one of: ${STATUSES.join(', ')}`);
          }
          filters.status = status;
        }

        if (options.type !== undefined) {
          const type = options.type as IssueType;
          if (!ISSUE_TYPES.includes(type)) {
            throw new Error(`Invalid type: ${type}. Must be one of: ${ISSUE_TYPES.join(', ')}`);
          }
          filters.type = type;
        }

        if (options.priority !== undefined) {
          const priority = parseInt(options.priority, 10) as Priority;
          if (!PRIORITIES.includes(priority)) {
            throw new Error(`Invalid priority: ${options.priority}. Must be 0-4`);
          }
          filters.priority = priority;
        }

        if (options.parent !== undefined) {
          filters.parent = resolveId(options.parent);
        }

        let issues = getIssues(filters);

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

        // Verbose output: flat list with expanded details
        if (options.verbose) {
          // Build verbose info for each issue
          const verboseIssues: VerboseIssueInfo[] = issues.map((issue) => {
            const info: VerboseIssueInfo = {
              issue,
              blocking: getBlocking(issue.id).map((i) => i.id),
              children: getChildren(issue.id).length,
              verifications: getVerifications(issue.id).length,
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

          // Determine section header based on filters
          let sectionHeader = 'Issues';
          if (filters.status) {
            sectionHeader = `${STATUS_LABELS[filters.status]} Issues`;
          }
          outputIssueListVerbose(verboseIssues, pretty, sectionHeader, limitInfo);
        } else if (options.flat) {
          // Flat output: simple table/list
          outputIssueList(issues, pretty, limitInfo);
        } else {
          // Default: hierarchical tree structure
          let sectionHeader = 'Issues';
          if (filters.status) {
            sectionHeader = `${STATUS_LABELS[filters.status]} Issues`;
          }
          outputIssueTree(issues, pretty, sectionHeader, limitInfo);
        }
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });
}
