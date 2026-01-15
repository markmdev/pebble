import type { Issue, IssueEvent, Priority, Status, IssueType } from '../../shared/types.js';
import { PRIORITY_LABELS, STATUS_LABELS, TYPE_LABELS } from '../../shared/types.js';

/**
 * Format data as JSON string
 */
export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Format a priority value for display
 */
function formatPriority(priority: Priority): string {
  return `P${priority} (${PRIORITY_LABELS[priority]})`;
}

/**
 * Format a status value for display
 */
function formatStatus(status: Status): string {
  return STATUS_LABELS[status];
}

/**
 * Format a type value for display
 */
function formatType(type: IssueType): string {
  return TYPE_LABELS[type];
}

/**
 * Truncate a string to max length with ellipsis
 */
function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Pad a string to a fixed width
 */
function pad(str: string, width: number): string {
  return str.padEnd(width);
}

/**
 * Format a single issue for pretty display
 */
export function formatIssuePretty(issue: Issue): string {
  const lines: string[] = [];

  lines.push(`${issue.id} - ${issue.title}`);
  lines.push('─'.repeat(60));
  lines.push(`Type:     ${formatType(issue.type)}`);
  lines.push(`Priority: ${formatPriority(issue.priority)}`);
  lines.push(`Status:   ${formatStatus(issue.status)}`);

  if (issue.parent) {
    lines.push(`Parent:   ${issue.parent}`);
  }

  if (issue.description) {
    lines.push('');
    lines.push('Description:');
    lines.push(issue.description);
  }

  if (issue.blockedBy.length > 0) {
    lines.push('');
    lines.push(`Blocked by: ${issue.blockedBy.join(', ')}`);
  }

  if (issue.comments.length > 0) {
    lines.push('');
    lines.push('Comments:');
    for (const comment of issue.comments) {
      const author = comment.author ?? 'unknown';
      const date = new Date(comment.timestamp).toLocaleString();
      lines.push(`  [${date}] ${author}: ${comment.text}`);
    }
  }

  lines.push('');
  lines.push(`Created: ${new Date(issue.createdAt).toLocaleString()}`);
  lines.push(`Updated: ${new Date(issue.updatedAt).toLocaleString()}`);

  return lines.join('\n');
}

/**
 * Format a single issue with blocking info for pretty display
 */
export function formatIssuePrettyWithBlocking(issue: Issue, blocking: Issue[]): string {
  const lines: string[] = [];

  lines.push(`${issue.id} - ${issue.title}`);
  lines.push('─'.repeat(60));
  lines.push(`Type:     ${formatType(issue.type)}`);
  lines.push(`Priority: ${formatPriority(issue.priority)}`);
  lines.push(`Status:   ${formatStatus(issue.status)}`);

  if (issue.parent) {
    lines.push(`Parent:   ${issue.parent}`);
  }

  if (issue.description) {
    lines.push('');
    lines.push('Description:');
    lines.push(issue.description);
  }

  if (issue.blockedBy.length > 0) {
    lines.push('');
    lines.push(`Blocked by: ${issue.blockedBy.join(', ')}`);
  }

  if (blocking.length > 0) {
    lines.push('');
    lines.push(`Blocking: ${blocking.map(i => i.id).join(', ')}`);
  }

  if (issue.comments.length > 0) {
    lines.push('');
    lines.push('Comments:');
    for (const comment of issue.comments) {
      const author = comment.author ?? 'unknown';
      const date = new Date(comment.timestamp).toLocaleString();
      lines.push(`  [${date}] ${author}: ${comment.text}`);
    }
  }

  lines.push('');
  lines.push(`Created: ${new Date(issue.createdAt).toLocaleString()}`);
  lines.push(`Updated: ${new Date(issue.updatedAt).toLocaleString()}`);

  return lines.join('\n');
}

/**
 * Format a list of issues as a table
 */
export function formatIssueListPretty(issues: Issue[]): string {
  if (issues.length === 0) {
    return 'No issues found.';
  }

  const lines: string[] = [];

  // Header
  const idWidth = 12;
  const typeWidth = 6;
  const prioWidth = 4;
  const statusWidth = 12;
  const titleWidth = 40;

  const header = [
    pad('ID', idWidth),
    pad('Type', typeWidth),
    pad('Pri', prioWidth),
    pad('Status', statusWidth),
    pad('Title', titleWidth),
  ].join(' │ ');

  lines.push(header);
  lines.push('─'.repeat(header.length));

  // Rows
  for (const issue of issues) {
    const row = [
      pad(issue.id, idWidth),
      pad(issue.type, typeWidth),
      pad(`P${issue.priority}`, prioWidth),
      pad(issue.status, statusWidth),
      truncate(issue.title, titleWidth),
    ].join(' │ ');
    lines.push(row);
  }

  lines.push('');
  lines.push(`Total: ${issues.length} issue(s)`);

  return lines.join('\n');
}

/**
 * Format dependency info for pretty display
 */
export function formatDepsPretty(
  issueId: string,
  blockedBy: Issue[],
  blocking: Issue[]
): string {
  const lines: string[] = [];

  lines.push(`Dependencies for ${issueId}`);
  lines.push('─'.repeat(40));

  lines.push('');
  lines.push('Blocked by:');
  if (blockedBy.length === 0) {
    lines.push('  (none)');
  } else {
    for (const issue of blockedBy) {
      const status = issue.status === 'closed' ? '✓' : '○';
      lines.push(`  ${status} ${issue.id} - ${truncate(issue.title, 30)}`);
    }
  }

  lines.push('');
  lines.push('Blocking:');
  if (blocking.length === 0) {
    lines.push('  (none)');
  } else {
    for (const issue of blocking) {
      lines.push(`  ○ ${issue.id} - ${truncate(issue.title, 30)}`);
    }
  }

  return lines.join('\n');
}

/**
 * Format events for pretty display
 */
export function formatEventsPretty(events: IssueEvent[]): string {
  if (events.length === 0) {
    return 'No events found.';
  }

  const lines: string[] = [];

  for (const event of events) {
    const date = new Date(event.timestamp).toLocaleString();
    lines.push(`[${date}] ${event.type.toUpperCase()} ${event.issueId}`);
  }

  lines.push('');
  lines.push(`Total: ${events.length} event(s)`);

  return lines.join('\n');
}

/**
 * Format an error for output
 */
export function formatError(error: Error | string): string {
  const message = error instanceof Error ? error.message : error;
  return JSON.stringify({ error: message });
}

/**
 * Format an error for pretty display
 */
export function formatErrorPretty(error: Error | string): string {
  const message = error instanceof Error ? error.message : error;
  return `Error: ${message}`;
}

/**
 * Output data in the requested format
 */
export function output(data: unknown, pretty: boolean): void {
  if (pretty) {
    // For pretty mode, we need to know the type
    // This is a generic fallback
    console.log(formatJson(data));
  } else {
    console.log(formatJson(data));
  }
}

/**
 * Output an issue in the requested format
 */
export function outputIssue(issue: Issue, pretty: boolean): void {
  if (pretty) {
    console.log(formatIssuePretty(issue));
  } else {
    console.log(formatJson(issue));
  }
}

/**
 * Output an issue with blocking info in the requested format
 */
export function outputIssueWithBlocking(issue: Issue, blocking: Issue[], pretty: boolean): void {
  if (pretty) {
    console.log(formatIssuePrettyWithBlocking(issue, blocking));
  } else {
    // Include blocking IDs in JSON output
    const output = {
      ...issue,
      blocking: blocking.map(i => i.id),
    };
    console.log(formatJson(output));
  }
}

/**
 * Output a mutation success response (minimal: id + success)
 */
export function outputMutationSuccess(id: string, pretty: boolean): void {
  if (pretty) {
    console.log(`✓ ${id}`);
  } else {
    console.log(JSON.stringify({ id, success: true }));
  }
}

/**
 * Output a list of issues in the requested format
 */
export function outputIssueList(issues: Issue[], pretty: boolean): void {
  if (pretty) {
    console.log(formatIssueListPretty(issues));
  } else {
    console.log(formatJson(issues));
  }
}

/**
 * Output an error in the requested format
 */
export function outputError(error: Error | string, pretty: boolean): void {
  if (pretty) {
    console.error(formatErrorPretty(error));
  } else {
    console.error(formatError(error));
  }
  process.exit(1);
}
