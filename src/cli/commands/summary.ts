import { Command } from 'commander';
import type { Status } from '../../shared/types.js';
import { STATUSES } from '../../shared/types.js';
import { getOrCreatePebbleDir } from '../lib/storage.js';
import { getIssues, getChildren, getIssue } from '../lib/state.js';
import { outputError, formatJson } from '../lib/output.js';

interface ChildCounts {
  total: number;
  done: number;
  in_progress: number;
  open: number;
  blocked: number;
}

interface EpicSummary {
  id: string;
  title: string;
  description?: string;
  status: Status;
  parent?: {
    id: string;
    title: string;
  };
  children: ChildCounts;
}

function countChildren(epicId: string): ChildCounts {
  const children = getChildren(epicId);
  return {
    total: children.length,
    done: children.filter((c) => c.status === 'closed').length,
    in_progress: children.filter((c) => c.status === 'in_progress').length,
    open: children.filter((c) => c.status === 'open').length,
    blocked: children.filter((c) => c.status === 'blocked').length,
  };
}

function formatSummaryPretty(summaries: EpicSummary[]): string {
  if (summaries.length === 0) {
    return 'No epics found.';
  }

  const lines: string[] = [];

  for (const summary of summaries) {
    const { children } = summary;
    const progress = children.total > 0
      ? `(${children.done}/${children.total} done)`
      : '(no children)';

    lines.push(`${summary.id} ${summary.title} ${progress}`);

    if (summary.parent) {
      lines.push(`    Parent: ${summary.parent.id} "${summary.parent.title}"`);
    }

    if (summary.description) {
      // Truncate description to first line, max 60 chars
      const desc = summary.description.split('\n')[0];
      const truncated = desc.length > 60 ? desc.slice(0, 57) + '...' : desc;
      lines.push(`    ${truncated}`);
    }
  }

  return lines.join('\n');
}

export function summaryCommand(program: Command): void {
  program
    .command('summary')
    .description('Show epic summary with child completion status')
    .option('--status <status>', 'Filter epics by status (default: open)')
    .option('--limit <n>', 'Max epics to return', '10')
    .option('--include-closed', 'Include closed epics')
    .action(async (options) => {
      const pretty = program.opts().pretty ?? false;

      try {
        getOrCreatePebbleDir();

        // Get all epics
        let epics = getIssues({ type: 'epic' });

        // Filter by status
        if (options.includeClosed) {
          // Show all epics
        } else if (options.status !== undefined) {
          const status = options.status as Status;
          if (!STATUSES.includes(status)) {
            throw new Error(`Invalid status: ${status}. Must be one of: ${STATUSES.join(', ')}`);
          }
          epics = epics.filter((e) => e.status === status);
        } else {
          // Default: show non-closed epics
          epics = epics.filter((e) => e.status !== 'closed');
        }

        // Sort by updatedAt descending (most recently updated first)
        epics.sort((a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );

        // Apply limit
        const limit = parseInt(options.limit, 10);
        if (limit > 0) {
          epics = epics.slice(0, limit);
        }

        // Build summaries
        const summaries: EpicSummary[] = epics.map((epic) => {
          const summary: EpicSummary = {
            id: epic.id,
            title: epic.title,
            description: epic.description,
            status: epic.status,
            children: countChildren(epic.id),
          };

          if (epic.parent) {
            const parentIssue = getIssue(epic.parent);
            if (parentIssue) {
              summary.parent = {
                id: parentIssue.id,
                title: parentIssue.title,
              };
            }
          }

          return summary;
        });

        if (pretty) {
          console.log(formatSummaryPretty(summaries));
        } else {
          console.log(formatJson(summaries));
        }
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });
}
