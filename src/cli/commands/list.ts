import { Command } from 'commander';
import type { IssueType, Priority, Status, IssueFilters } from '../../shared/types.js';
import { ISSUE_TYPES, PRIORITIES, STATUSES } from '../../shared/types.js';
import { getIssues, resolveId } from '../lib/state.js';
import { outputIssueList, outputError } from '../lib/output.js';

export function listCommand(program: Command): void {
  program
    .command('list')
    .description('List issues')
    .option('--status <status>', 'Filter by status')
    .option('-t, --type <type>', 'Filter by type')
    .option('--priority <priority>', 'Filter by priority')
    .option('--parent <id>', 'Filter by parent epic')
    .action(async (options) => {
      const pretty = program.opts().pretty ?? false;

      try {
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

        const issues = getIssues(filters);
        outputIssueList(issues, pretty);
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });
}
