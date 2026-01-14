import type { Issue } from '../../shared/types';

/**
 * Sorts issues by their dependencies using topological sort.
 * Issues with no blockers come first, then issues whose blockers are all satisfied.
 * Handles cycles gracefully by placing cycle members in arbitrary order at the end.
 *
 * @param issues - Array of issues to sort
 * @returns New array sorted by dependencies
 */
export function sortByDependencies(issues: Issue[]): Issue[] {
  const issueMap = new Map(issues.map((i) => [i.id, i]));
  const result: Issue[] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>(); // For cycle detection

  function visit(id: string): void {
    if (visited.has(id)) return;
    if (inStack.has(id)) return; // Cycle detected, skip

    const issue = issueMap.get(id);
    if (!issue) return;

    inStack.add(id);

    // Visit all blockers first (they should come before this issue)
    for (const blockerId of issue.blockedBy) {
      visit(blockerId);
    }

    inStack.delete(id);
    visited.add(id);
    result.push(issue);
  }

  // Visit all issues
  for (const issue of issues) {
    visit(issue.id);
  }

  return result;
}

/**
 * Status sort order for issues.
 * in_progress (active) → open (todo) → blocked (waiting) → closed (done)
 */
const STATUS_ORDER: Record<string, number> = {
  in_progress: 0,
  open: 1,
  blocked: 2,
  closed: 3,
};

/**
 * Gets the numeric sort order for a status.
 * @param status - Issue status
 * @returns Numeric order (lower = higher priority)
 */
export function getStatusOrder(status: string): number {
  return STATUS_ORDER[status] ?? 4;
}

/**
 * Sorts issues by status in the standard order:
 * in_progress → open → blocked → closed
 *
 * @param issues - Array of issues to sort
 * @returns New array sorted by status
 */
export function sortByStatus(issues: Issue[]): Issue[] {
  return [...issues].sort((a, b) => {
    return getStatusOrder(a.status) - getStatusOrder(b.status);
  });
}

/**
 * Groups issues into open (non-closed) and closed.
 * Useful for showing closed items at the bottom.
 *
 * @param issues - Array of issues to partition
 * @returns Object with open and closed arrays
 */
export function partitionByClosedStatus(issues: Issue[]): {
  open: Issue[];
  closed: Issue[];
} {
  const open: Issue[] = [];
  const closed: Issue[] = [];

  for (const issue of issues) {
    if (issue.status === 'closed') {
      closed.push(issue);
    } else {
      open.push(issue);
    }
  }

  return { open, closed };
}
