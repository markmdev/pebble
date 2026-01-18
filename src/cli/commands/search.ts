import { Command } from 'commander';
import type { Issue, IssueType, Status } from '../../shared/types.js';
import { ISSUE_TYPES, STATUSES } from '../../shared/types.js';
import { getOrCreatePebbleDir } from '../lib/storage.js';
import { getIssues } from '../lib/state.js';
import { outputIssueList, outputError } from '../lib/output.js';

function searchIssues(issues: Issue[], query: string): Issue[] {
  const lowerQuery = query.toLowerCase();

  return issues.filter((issue) => {
    // Search in ID
    if (issue.id.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    // Search in title
    if (issue.title.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    // Search in description
    if (issue.description?.toLowerCase().includes(lowerQuery)) {
      return true;
    }

    // Search in comments
    if (issue.comments.some((c) => c.text.toLowerCase().includes(lowerQuery))) {
      return true;
    }

    return false;
  });
}

export function searchCommand(program: Command): void {
  program
    .command('search <query>')
    .description('Search issues by text in title, description, and comments')
    .option('--status <status>', 'Filter by status')
    .option('-t, --type <type>', 'Filter by type')
    .option('--limit <n>', 'Max results', '20')
    .action(async (query, options) => {
      const pretty = program.opts().pretty ?? false;

      try {
        getOrCreatePebbleDir();

        let issues = getIssues();

        // Apply status filter
        if (options.status !== undefined) {
          const status = options.status as Status;
          if (!STATUSES.includes(status)) {
            throw new Error(`Invalid status: ${status}. Must be one of: ${STATUSES.join(', ')}`);
          }
          issues = issues.filter((i) => i.status === status);
        }

        // Apply type filter
        if (options.type !== undefined) {
          const type = options.type as IssueType;
          if (!ISSUE_TYPES.includes(type)) {
            throw new Error(`Invalid type: ${type}. Must be one of: ${ISSUE_TYPES.join(', ')}`);
          }
          issues = issues.filter((i) => i.type === type);
        }

        // Perform search
        let results = searchIssues(issues, query);

        // Sort by relevance (title matches first, then by updatedAt)
        const lowerQuery = query.toLowerCase();
        results.sort((a, b) => {
          const aInTitle = a.title.toLowerCase().includes(lowerQuery);
          const bInTitle = b.title.toLowerCase().includes(lowerQuery);

          if (aInTitle && !bInTitle) return -1;
          if (!aInTitle && bInTitle) return 1;

          // Secondary sort: newest first
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });

        // Apply limit
        const limit = parseInt(options.limit, 10);
        if (limit > 0) {
          results = results.slice(0, limit);
        }

        outputIssueList(results, pretty);
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });
}
