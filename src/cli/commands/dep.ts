import { Command } from 'commander';
import type { Issue, UpdateEvent } from '../../shared/types.js';
import { getOrCreatePebbleDir, appendEvent, readEvents } from '../lib/storage.js';
import {
  getIssue,
  resolveId,
  detectCycle,
  getBlockers,
  getBlocking,
  getRelated,
  computeState,
} from '../lib/state.js';
import { outputMutationSuccess, outputError, formatDepsPretty, formatJson } from '../lib/output.js';

export function depCommand(program: Command): void {
  const dep = program
    .command('dep')
    .description('Manage dependencies');

  // dep add <id> <blocker-id>
  dep
    .command('add <id> <blockerId>')
    .description('Add a blocking dependency')
    .action(async (id: string, blockerId: string) => {
      const pretty = program.opts().pretty ?? false;

      try {
        const pebbleDir = getOrCreatePebbleDir();
        const resolvedId = resolveId(id);
        const resolvedBlockerId = resolveId(blockerId);

        const issue = getIssue(resolvedId);
        if (!issue) {
          throw new Error(`Issue not found: ${id}`);
        }

        const blocker = getIssue(resolvedBlockerId);
        if (!blocker) {
          throw new Error(`Blocker issue not found: ${blockerId}`);
        }

        // Check for self-reference
        if (resolvedId === resolvedBlockerId) {
          throw new Error('Cannot add self as blocker');
        }

        // Check for existing dependency
        if (issue.blockedBy.includes(resolvedBlockerId)) {
          throw new Error(`Dependency already exists: ${resolvedId} is blocked by ${resolvedBlockerId}`);
        }

        // Check for cycles
        if (detectCycle(resolvedId, resolvedBlockerId)) {
          throw new Error(`Adding this dependency would create a cycle`);
        }

        // Add the dependency
        const event: UpdateEvent = {
          type: 'update',
          issueId: resolvedId,
          timestamp: new Date().toISOString(),
          data: {
            blockedBy: [...issue.blockedBy, resolvedBlockerId],
          },
        };

        appendEvent(event, pebbleDir);

        outputMutationSuccess(resolvedId, pretty);
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });

  // dep remove <id> <blocker-id>
  dep
    .command('remove <id> <blockerId>')
    .description('Remove a blocking dependency')
    .action(async (id: string, blockerId: string) => {
      const pretty = program.opts().pretty ?? false;

      try {
        const pebbleDir = getOrCreatePebbleDir();
        const resolvedId = resolveId(id);
        const resolvedBlockerId = resolveId(blockerId);

        const issue = getIssue(resolvedId);
        if (!issue) {
          throw new Error(`Issue not found: ${id}`);
        }

        // Check if dependency exists before removing
        if (!issue.blockedBy.includes(resolvedBlockerId)) {
          throw new Error(`Dependency does not exist: ${resolvedId} is not blocked by ${resolvedBlockerId}`);
        }

        // Remove the dependency
        const newBlockedBy = issue.blockedBy.filter((b) => b !== resolvedBlockerId);

        const event: UpdateEvent = {
          type: 'update',
          issueId: resolvedId,
          timestamp: new Date().toISOString(),
          data: {
            blockedBy: newBlockedBy,
          },
        };

        appendEvent(event, pebbleDir);

        outputMutationSuccess(resolvedId, pretty);
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });

  // dep relate <id1> <id2> - bidirectional relationship
  dep
    .command('relate <id1> <id2>')
    .description('Add a bidirectional related link between two issues')
    .action(async (id1: string, id2: string) => {
      const pretty = program.opts().pretty ?? false;

      try {
        const pebbleDir = getOrCreatePebbleDir();
        const resolvedId1 = resolveId(id1);
        const resolvedId2 = resolveId(id2);

        const issue1 = getIssue(resolvedId1);
        if (!issue1) {
          throw new Error(`Issue not found: ${id1}`);
        }

        const issue2 = getIssue(resolvedId2);
        if (!issue2) {
          throw new Error(`Issue not found: ${id2}`);
        }

        // Check for self-reference
        if (resolvedId1 === resolvedId2) {
          throw new Error('Cannot relate issue to itself');
        }

        // Check if already related
        if (issue1.relatedTo.includes(resolvedId2)) {
          throw new Error(`Issues are already related: ${resolvedId1} ↔ ${resolvedId2}`);
        }

        const timestamp = new Date().toISOString();

        // Add bidirectional relationship
        const event1: UpdateEvent = {
          type: 'update',
          issueId: resolvedId1,
          timestamp,
          data: {
            relatedTo: [...issue1.relatedTo, resolvedId2],
          },
        };

        const event2: UpdateEvent = {
          type: 'update',
          issueId: resolvedId2,
          timestamp,
          data: {
            relatedTo: [...issue2.relatedTo, resolvedId1],
          },
        };

        appendEvent(event1, pebbleDir);
        appendEvent(event2, pebbleDir);

        if (pretty) {
          console.log(`✓ ${resolvedId1} ↔ ${resolvedId2}`);
        } else {
          console.log(formatJson({ id1: resolvedId1, id2: resolvedId2, related: true }));
        }
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });

  // dep unrelate <id1> <id2> - remove bidirectional relationship
  dep
    .command('unrelate <id1> <id2>')
    .description('Remove a bidirectional related link between two issues')
    .action(async (id1: string, id2: string) => {
      const pretty = program.opts().pretty ?? false;

      try {
        const pebbleDir = getOrCreatePebbleDir();
        const resolvedId1 = resolveId(id1);
        const resolvedId2 = resolveId(id2);

        const issue1 = getIssue(resolvedId1);
        if (!issue1) {
          throw new Error(`Issue not found: ${id1}`);
        }

        const issue2 = getIssue(resolvedId2);
        if (!issue2) {
          throw new Error(`Issue not found: ${id2}`);
        }

        // Check if related
        if (!issue1.relatedTo.includes(resolvedId2)) {
          throw new Error(`Issues are not related: ${resolvedId1} ↔ ${resolvedId2}`);
        }

        const timestamp = new Date().toISOString();

        // Remove bidirectional relationship
        const event1: UpdateEvent = {
          type: 'update',
          issueId: resolvedId1,
          timestamp,
          data: {
            relatedTo: issue1.relatedTo.filter((id) => id !== resolvedId2),
          },
        };

        const event2: UpdateEvent = {
          type: 'update',
          issueId: resolvedId2,
          timestamp,
          data: {
            relatedTo: issue2.relatedTo.filter((id) => id !== resolvedId1),
          },
        };

        appendEvent(event1, pebbleDir);
        appendEvent(event2, pebbleDir);

        if (pretty) {
          console.log(`✓ ${resolvedId1} ↮ ${resolvedId2}`);
        } else {
          console.log(formatJson({ id1: resolvedId1, id2: resolvedId2, related: false }));
        }
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });

  // dep list <id>
  dep
    .command('list <id>')
    .description('List dependencies for an issue')
    .action(async (id: string) => {
      const pretty = program.opts().pretty ?? false;

      try {
        const resolvedId = resolveId(id);
        const issue = getIssue(resolvedId);

        if (!issue) {
          throw new Error(`Issue not found: ${id}`);
        }

        const blockedBy = getBlockers(resolvedId);
        const blocking = getBlocking(resolvedId);
        const related = getRelated(resolvedId);

        if (pretty) {
          console.log(formatDepsPretty(resolvedId, blockedBy, blocking, related));
        } else {
          console.log(formatJson({
            issueId: resolvedId,
            blockedBy: blockedBy.map((i) => ({ id: i.id, title: i.title, status: i.status })),
            blocking: blocking.map((i) => ({ id: i.id, title: i.title, status: i.status })),
            related: related.map((i) => ({ id: i.id, title: i.title, status: i.status })),
          }));
        }
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });

  // dep tree <id>
  dep
    .command('tree <id>')
    .description('Show dependency tree')
    .action(async (id: string) => {
      const pretty = program.opts().pretty ?? false;

      try {
        const resolvedId = resolveId(id);
        const issue = getIssue(resolvedId);

        if (!issue) {
          throw new Error(`Issue not found: ${id}`);
        }

        // Build tree structure - compute state once
        const events = readEvents();
        const state = computeState(events);
        const visited = new Set<string>();
        const tree = buildDepTree(resolvedId, visited, 0, state);

        if (pretty) {
          console.log(formatDepTree(tree));
        } else {
          console.log(formatJson(tree));
        }
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });
}

interface TreeNode {
  id: string;
  title: string;
  status: string;
  depth: number;
  blockedBy: TreeNode[];
}

function buildDepTree(
  issueId: string,
  visited: Set<string>,
  depth: number,
  state: Map<string, Issue>
): TreeNode | null {
  if (visited.has(issueId)) {
    return null; // Prevent infinite loops
  }
  visited.add(issueId);

  const issue = state.get(issueId);
  if (!issue) {
    return null;
  }

  const blockedBy: TreeNode[] = [];
  for (const blockerId of issue.blockedBy) {
    const child = buildDepTree(blockerId, visited, depth + 1, state);
    if (child) {
      blockedBy.push(child);
    }
  }

  return {
    id: issue.id,
    title: issue.title,
    status: issue.status,
    depth,
    blockedBy,
  };
}

function formatDepTree(node: TreeNode | null, prefix: string = '', isRoot: boolean = true): string {
  if (!node) {
    return '';
  }

  const lines: string[] = [];
  const statusIcon = node.status === 'closed' ? '✓' : '○';

  if (isRoot) {
    lines.push(`${statusIcon} ${node.id} - ${node.title}`);
  }

  for (let i = 0; i < node.blockedBy.length; i++) {
    const child = node.blockedBy[i];
    const isLast = i === node.blockedBy.length - 1;
    const connector = isLast ? '└─ ' : '├─ ';
    const childPrefix = prefix + (isLast ? '   ' : '│  ');

    const childStatusIcon = child.status === 'closed' ? '✓' : '○';
    lines.push(`${prefix}${connector}${childStatusIcon} ${child.id} - ${child.title}`);

    if (child.blockedBy.length > 0) {
      lines.push(formatDepTree(child, childPrefix, false));
    }
  }

  return lines.join('\n');
}
