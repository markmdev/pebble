import type {
  Issue,
  IssueEvent,
  CreateEvent,
  UpdateEvent,
  CommentEvent,
  IssueFilters,
} from '../../shared/types.js';
import { readEvents } from './storage.js';

/**
 * Compute current issue state from a list of events
 * Returns a map of issue ID to current Issue state
 */
export function computeState(events: IssueEvent[]): Map<string, Issue> {
  const issues = new Map<string, Issue>();

  for (const event of events) {
    switch (event.type) {
      case 'create': {
        const createEvent = event as CreateEvent;
        const issue: Issue = {
          id: event.issueId,
          title: createEvent.data.title,
          type: createEvent.data.type,
          priority: createEvent.data.priority,
          status: 'open',
          description: createEvent.data.description,
          parent: createEvent.data.parent,
          blockedBy: [],
          comments: [],
          createdAt: event.timestamp,
          updatedAt: event.timestamp,
        };
        issues.set(event.issueId, issue);
        break;
      }

      case 'update': {
        const updateEvent = event as UpdateEvent;
        const issue = issues.get(event.issueId);
        if (issue) {
          if (updateEvent.data.title !== undefined) {
            issue.title = updateEvent.data.title;
          }
          if (updateEvent.data.type !== undefined) {
            issue.type = updateEvent.data.type;
          }
          if (updateEvent.data.priority !== undefined) {
            issue.priority = updateEvent.data.priority;
          }
          if (updateEvent.data.status !== undefined) {
            issue.status = updateEvent.data.status;
          }
          if (updateEvent.data.description !== undefined) {
            issue.description = updateEvent.data.description;
          }
          if (updateEvent.data.parent !== undefined) {
            issue.parent = updateEvent.data.parent;
          }
          if (updateEvent.data.blockedBy !== undefined) {
            issue.blockedBy = updateEvent.data.blockedBy;
          }
          issue.updatedAt = event.timestamp;
        }
        break;
      }

      case 'close': {
        const issue = issues.get(event.issueId);
        if (issue) {
          issue.status = 'closed';
          issue.updatedAt = event.timestamp;
        }
        break;
      }

      case 'reopen': {
        const issue = issues.get(event.issueId);
        if (issue) {
          issue.status = 'open';
          issue.updatedAt = event.timestamp;
        }
        break;
      }

      case 'comment': {
        const commentEvent = event as CommentEvent;
        const issue = issues.get(event.issueId);
        if (issue) {
          issue.comments.push(commentEvent.data);
          issue.updatedAt = event.timestamp;
        }
        break;
      }
    }
  }

  return issues;
}

/**
 * Get all issues as an array, optionally filtered
 */
export function getIssues(filters?: IssueFilters): Issue[] {
  const events = readEvents();
  const state = computeState(events);
  let issues = Array.from(state.values());

  if (filters) {
    if (filters.status !== undefined) {
      issues = issues.filter((i) => i.status === filters.status);
    }
    if (filters.type !== undefined) {
      issues = issues.filter((i) => i.type === filters.type);
    }
    if (filters.priority !== undefined) {
      issues = issues.filter((i) => i.priority === filters.priority);
    }
    if (filters.parent !== undefined) {
      issues = issues.filter((i) => i.parent === filters.parent);
    }
  }

  return issues;
}

/**
 * Get a single issue by ID
 */
export function getIssue(id: string): Issue | undefined {
  const events = readEvents();
  const state = computeState(events);
  return state.get(id);
}

/**
 * Resolve a partial ID to a full ID
 * Supports: exact match, prefix match, suffix-only match
 * All matching is case-insensitive
 * Throws if ambiguous (multiple matches) or not found
 */
export function resolveId(partial: string): string {
  const events = readEvents();
  const state = computeState(events);
  const allIds = Array.from(state.keys());
  const partialLower = partial.toLowerCase();

  // First try exact match (case-insensitive)
  const exactMatch = allIds.find((id) => id.toLowerCase() === partialLower);
  if (exactMatch) {
    return exactMatch;
  }

  // Then try prefix match
  const prefixMatches = allIds.filter((id) =>
    id.toLowerCase().startsWith(partialLower)
  );

  if (prefixMatches.length === 1) {
    return prefixMatches[0];
  }

  if (prefixMatches.length > 1) {
    throw new Error(
      `Ambiguous issue ID '${partial}'. Matches: ${prefixMatches.join(', ')}`
    );
  }

  // Then try suffix match (part after the hyphen)
  const suffixMatches = allIds.filter((id) => {
    const hyphenIndex = id.indexOf('-');
    if (hyphenIndex === -1) return false;
    const suffix = id.substring(hyphenIndex + 1).toLowerCase();
    return suffix === partialLower;
  });

  if (suffixMatches.length === 1) {
    return suffixMatches[0];
  }

  if (suffixMatches.length > 1) {
    throw new Error(
      `Ambiguous issue ID '${partial}'. Matches: ${suffixMatches.join(', ')}`
    );
  }

  throw new Error(`Issue not found: ${partial}`);
}

/**
 * Get issues that are ready for work (non-closed with no open blockers)
 */
export function getReady(): Issue[] {
  const events = readEvents();
  const state = computeState(events);
  const issues = Array.from(state.values());

  return issues.filter((issue) => {
    // Must not be closed
    if (issue.status === 'closed') {
      return false;
    }

    // All blockers must be closed
    for (const blockerId of issue.blockedBy) {
      const blocker = state.get(blockerId);
      if (blocker && blocker.status !== 'closed') {
        return false;
      }
    }

    return true;
  });
}

/**
 * Get issues that are blocked (have at least one open blocker)
 */
export function getBlocked(): Issue[] {
  const events = readEvents();
  const state = computeState(events);
  const issues = Array.from(state.values());

  return issues.filter((issue) => {
    // Must not be closed
    if (issue.status === 'closed') {
      return false;
    }

    // Check if any blocker is not closed
    for (const blockerId of issue.blockedBy) {
      const blocker = state.get(blockerId);
      if (blocker && blocker.status !== 'closed') {
        return true;
      }
    }

    return false;
  });
}

/**
 * Build a dependency graph as adjacency list
 * Returns a map of issueId -> list of issues it blocks
 */
export function buildDependencyGraph(): Map<string, string[]> {
  const events = readEvents();
  const state = computeState(events);
  const graph = new Map<string, string[]>();

  // Initialize all nodes
  for (const id of state.keys()) {
    graph.set(id, []);
  }

  // Build edges (blocker -> blocked)
  for (const [id, issue] of state) {
    for (const blockerId of issue.blockedBy) {
      const blockerEdges = graph.get(blockerId);
      if (blockerEdges) {
        blockerEdges.push(id);
      }
    }
  }

  return graph;
}

/**
 * Check if adding a dependency would create a cycle
 * Uses DFS to detect if newBlockerId can reach issueId
 */
export function detectCycle(issueId: string, newBlockerId: string): boolean {
  if (issueId === newBlockerId) {
    return true; // Self-reference
  }

  const graph = buildDependencyGraph();

  // Add the proposed edge temporarily
  const blockerEdges = graph.get(newBlockerId) ?? [];
  const testGraph = new Map(graph);
  testGraph.set(newBlockerId, [...blockerEdges, issueId]);

  // DFS to check if issueId can reach newBlockerId (which would mean a cycle)
  const visited = new Set<string>();
  const stack = [issueId];

  while (stack.length > 0) {
    const current = stack.pop()!;

    if (current === newBlockerId) {
      return true; // Found a cycle
    }

    if (visited.has(current)) {
      continue;
    }
    visited.add(current);

    const edges = testGraph.get(current) ?? [];
    for (const next of edges) {
      if (!visited.has(next)) {
        stack.push(next);
      }
    }
  }

  return false;
}

/**
 * Get issues that block a given issue
 */
export function getBlockers(issueId: string): Issue[] {
  const issue = getIssue(issueId);
  if (!issue) {
    return [];
  }

  const events = readEvents();
  const state = computeState(events);

  return issue.blockedBy
    .map((id) => state.get(id))
    .filter((i): i is Issue => i !== undefined);
}

/**
 * Get issues that are blocked by a given issue
 */
export function getBlocking(issueId: string): Issue[] {
  const events = readEvents();
  const state = computeState(events);

  return Array.from(state.values()).filter((issue) =>
    issue.blockedBy.includes(issueId)
  );
}

/**
 * Get children of an epic
 */
export function getChildren(epicId: string): Issue[] {
  const events = readEvents();
  const state = computeState(events);

  return Array.from(state.values()).filter((issue) => issue.parent === epicId);
}

/**
 * Check if an epic has any open children
 */
export function hasOpenChildren(epicId: string): boolean {
  const children = getChildren(epicId);
  return children.some((child) => child.status !== 'closed');
}
