import { Command } from 'commander';
import type { Status } from '../../shared/types.js';
import { STATUSES, STATUS_LABELS } from '../../shared/types.js';
import { getOrCreatePebbleDir } from '../lib/storage.js';
import { getIssues, getChildren, getIssue, getVerifications } from '../lib/state.js';
import { outputError, formatJson } from '../lib/output.js';
import { formatRelativeTime } from '../../shared/time.js';

interface ChildCounts {
  total: number;
  done: number;
  pending_verification: number;
  in_progress: number;
  open: number;
  blocked: number;
}

interface EpicSummary {
  id: string;
  title: string;
  description?: string;
  status: Status;
  createdAt: string;
  updatedAt: string;
  parent?: {
    id: string;
    title: string;
  };
  children: ChildCounts;
  verifications: {
    total: number;
    done: number;
  };
}

function countChildren(epicId: string): ChildCounts {
  const children = getChildren(epicId);
  return {
    total: children.length,
    done: children.filter((c) => c.status === 'closed').length,
    pending_verification: children.filter((c) => c.status === 'pending_verification').length,
    in_progress: children.filter((c) => c.status === 'in_progress').length,
    open: children.filter((c) => c.status === 'open').length,
    blocked: children.filter((c) => c.status === 'blocked').length,
  };
}

function countVerifications(epicId: string): { total: number; done: number } {
  const children = getChildren(epicId);
  let total = 0;
  let done = 0;

  for (const child of children) {
    const verifications = getVerifications(child.id);
    total += verifications.length;
    done += verifications.filter((v) => v.status === 'closed').length;
  }

  return { total, done };
}

function formatSummaryPretty(summaries: EpicSummary[], sectionHeader: string): string {
  if (summaries.length === 0) {
    return 'No epics found.';
  }

  const lines: string[] = [];

  // Section header
  lines.push(`## ${sectionHeader} (${summaries.length})`);
  lines.push('');

  for (const summary of summaries) {
    const { children, verifications } = summary;

    // Epic line: ID: Title
    lines.push(`${summary.id}: ${summary.title}`);

    // Timestamps
    lines.push(`  Created: ${formatRelativeTime(summary.createdAt)} | Updated: ${formatRelativeTime(summary.updatedAt)}`);

    // Counts
    const pendingStr = children.pending_verification > 0 ? ` (${children.pending_verification} pending verification)` : '';
    const issueCount = `Issues: ${children.done}/${children.total} done${pendingStr}`;
    const verifCount = `Verifications: ${verifications.done}/${verifications.total} done`;
    lines.push(`  ${issueCount} | ${verifCount}`);

    // Parent if exists
    if (summary.parent) {
      lines.push(`  Parent: ${summary.parent.id} (${summary.parent.title})`);
    }

    // Full description (no trimming)
    if (summary.description) {
      lines.push('');
      lines.push(`  ${summary.description}`);
    }

    // Command hint
    lines.push('');
    lines.push(`  Run \`pb list --parent ${summary.id}\` to see all issues.`);
    lines.push('');
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
        const allEpics = getIssues({ type: 'epic' });

        // Helper to build summary for an epic
        const buildSummary = (epic: typeof allEpics[0]): EpicSummary => {
          const summary: EpicSummary = {
            id: epic.id,
            title: epic.title,
            description: epic.description,
            status: epic.status,
            createdAt: epic.createdAt,
            updatedAt: epic.updatedAt,
            children: countChildren(epic.id),
            verifications: countVerifications(epic.id),
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
        };

        const limit = parseInt(options.limit, 10);

        // Handle --include-closed: show both open and closed sections
        if (options.includeClosed) {
          const openEpics = allEpics.filter((e) => e.status !== 'closed');

          // Filter closed epics to last 72 hours (using updatedAt as proxy for close time)
          const seventyTwoHoursAgo = Date.now() - (72 * 60 * 60 * 1000);
          const closedEpics = allEpics.filter((e) =>
            e.status === 'closed' &&
            new Date(e.updatedAt).getTime() > seventyTwoHoursAgo
          );

          // Sort both by createdAt descending
          openEpics.sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
          closedEpics.sort((a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );

          // Apply limit to each section
          const limitedOpen = limit > 0 ? openEpics.slice(0, limit) : openEpics;
          const limitedClosed = limit > 0 ? closedEpics.slice(0, limit) : closedEpics;

          const openSummaries = limitedOpen.map(buildSummary);
          const closedSummaries = limitedClosed.map(buildSummary);

          if (pretty) {
            const output: string[] = [];
            if (openSummaries.length > 0) {
              output.push(formatSummaryPretty(openSummaries, 'Open Epics'));
            }
            if (closedSummaries.length > 0) {
              if (output.length > 0) output.push('');
              output.push(formatSummaryPretty(closedSummaries, 'Recently Closed Epics (last 72h)'));
            }
            console.log(output.join('\n'));
          } else {
            console.log(formatJson({ open: openSummaries, closed: closedSummaries }));
          }
          return;
        }

        // Filter by status
        let epics = allEpics;
        let sectionHeader = 'Open Epics';
        if (options.status !== undefined) {
          const status = options.status as Status;
          if (!STATUSES.includes(status)) {
            throw new Error(`Invalid status: ${status}. Must be one of: ${STATUSES.join(', ')}`);
          }
          epics = epics.filter((e) => e.status === status);
          sectionHeader = `${STATUS_LABELS[status]} Epics`;
        } else {
          // Default: show non-closed epics
          epics = epics.filter((e) => e.status !== 'closed');
        }

        // Sort by createdAt descending (newest first)
        epics.sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        // Apply limit
        if (limit > 0) {
          epics = epics.slice(0, limit);
        }

        // Build summaries
        const summaries: EpicSummary[] = epics.map(buildSummary);

        if (pretty) {
          console.log(formatSummaryPretty(summaries, sectionHeader));
        } else {
          console.log(formatJson(summaries));
        }
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });
}
