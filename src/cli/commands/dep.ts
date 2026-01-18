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

  // dep add <id> [blocker-id] --needs <id> --blocks <id>
  dep
    .command('add <id> [blockerId]')
    .description('Add a blocking dependency. Use --needs or --blocks for self-documenting syntax.')
    .option('--needs <id>', 'Issue that must be completed first (first arg needs this)')
    .option('--blocks <id>', 'Issue that this blocks (first arg blocks this)')
    .action(async (id: string, blockerId: string | undefined, options: { needs?: string; blocks?: string }) => {
      const pretty = program.opts().pretty ?? false;

      try {
        // Validate usage: cannot combine flags with each other or with positional
        if (options.needs && options.blocks) {
          throw new Error('Cannot use both --needs and --blocks');
        }
        if (blockerId && (options.needs || options.blocks)) {
          throw new Error('Cannot combine positional blockerId with --needs or --blocks');
        }
        if (!blockerId && !options.needs && !options.blocks) {
          throw new Error('Must provide blockerId, --needs <id>, or --blocks <id>');
        }

        const pebbleDir = getOrCreatePebbleDir();

        // Determine blocked and blocker based on usage:
        // pb dep add X Y          => X is blocked by Y
        // pb dep add X --needs Y  => X is blocked by Y (same as above)
        // pb dep add X --blocks Y => Y is blocked by X (inverted)
        let blockedId: string;
        let blockerIdResolved: string;

        if (options.blocks) {
          // X blocks Y => Y is blocked by X
          blockedId = resolveId(options.blocks);
          blockerIdResolved = resolveId(id);
        } else {
          // X needs Y or X Y => X is blocked by Y
          blockedId = resolveId(id);
          blockerIdResolved = resolveId(options.needs || blockerId!);
        }

        const issue = getIssue(blockedId);
        if (!issue) {
          throw new Error(`Issue not found: ${blockedId}`);
        }

        const blocker = getIssue(blockerIdResolved);
        if (!blocker) {
          throw new Error(`Blocker issue not found: ${blockerIdResolved}`);
        }

        // Check for self-reference
        if (blockedId === blockerIdResolved) {
          throw new Error('Cannot add self as blocker');
        }

        // Check for existing dependency
        if (issue.blockedBy.includes(blockerIdResolved)) {
          throw new Error(`Dependency already exists: ${blockedId} is blocked by ${blockerIdResolved}`);
        }

        // Check for cycles
        if (detectCycle(blockedId, blockerIdResolved)) {
          throw new Error(`Adding this dependency would create a cycle`);
        }

        // Add the dependency
        const event: UpdateEvent = {
          type: 'update',
          issueId: blockedId,
          timestamp: new Date().toISOString(),
          data: {
            blockedBy: [...issue.blockedBy, blockerIdResolved],
          },
        };

        appendEvent(event, pebbleDir);

        outputMutationSuccess(blockedId, pretty);
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
    .description('Show issue tree (children, verifications, and full hierarchy)')
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
        const tree = buildIssueTree(resolvedId, state);

        if (pretty) {
          console.log(formatIssueTreePretty(tree));
        } else {
          console.log(formatJson(tree));
        }
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });
}

interface IssueTreeNode {
  id: string;
  title: string;
  type: string;
  priority: number;
  status: string;
  isTarget?: boolean; // The issue that was requested
  childrenCount: number;
  children?: IssueTreeNode[];
}

function buildIssueTree(
  issueId: string,
  state: Map<string, Issue>
): IssueTreeNode | null {
  const issue = state.get(issueId);
  if (!issue) {
    return null;
  }

  // Build children recursively
  const buildChildren = (id: string, visited: Set<string>): IssueTreeNode[] => {
    const children: IssueTreeNode[] = [];
    for (const [, i] of state) {
      if ((i.parent === id || i.verifies === id) && !visited.has(i.id)) {
        visited.add(i.id);
        const nodeChildren = buildChildren(i.id, visited);
        children.push({
          id: i.id,
          title: i.title,
          type: i.type,
          priority: i.priority,
          status: i.status,
          isTarget: i.id === issueId,
          childrenCount: nodeChildren.length,
          ...(nodeChildren.length > 0 && { children: nodeChildren }),
        });
      }
    }
    return children;
  };

  // Build the target node with its children
  const visited = new Set<string>([issueId]);
  const targetChildren = buildChildren(issueId, visited);
  const targetNode: IssueTreeNode = {
    id: issue.id,
    title: issue.title,
    type: issue.type,
    priority: issue.priority,
    status: issue.status,
    isTarget: true,
    childrenCount: targetChildren.length,
    ...(targetChildren.length > 0 && { children: targetChildren }),
  };

  // Walk up the parent chain to find the root
  let currentNode = targetNode;
  let currentIssue = issue;

  while (currentIssue.parent) {
    const parentIssue = state.get(currentIssue.parent);
    if (!parentIssue) break;

    // Create parent node with current as child, plus any siblings
    const siblings: IssueTreeNode[] = [];
    for (const [, i] of state) {
      if ((i.parent === parentIssue.id || i.verifies === parentIssue.id) && i.id !== currentIssue.id) {
        // Add sibling (but don't expand its children to keep output focused)
        siblings.push({
          id: i.id,
          title: i.title,
          type: i.type,
          priority: i.priority,
          status: i.status,
          childrenCount: 0,
        });
      }
    }

    const parentNodeChildren = [currentNode, ...siblings];
    const parentNode: IssueTreeNode = {
      id: parentIssue.id,
      title: parentIssue.title,
      type: parentIssue.type,
      priority: parentIssue.priority,
      status: parentIssue.status,
      childrenCount: parentNodeChildren.length,
      children: parentNodeChildren,
    };

    currentNode = parentNode;
    currentIssue = parentIssue;
  }

  return currentNode;
}

function formatIssueTreePretty(node: IssueTreeNode | null): string {
  if (!node) {
    return 'Issue not found.';
  }

  const lines: string[] = [];

  const formatNode = (n: IssueTreeNode, prefix: string, isLast: boolean, isRoot: boolean): void => {
    const connector = isRoot ? '' : isLast ? '└─ ' : '├─ ';
    const statusIcon = n.status === 'closed' ? '✓' : n.status === 'in_progress' ? '▶' : n.status === 'pending_verification' ? '⏳' : '○';
    const marker = n.isTarget ? ' ◀' : '';

    lines.push(`${prefix}${connector}${statusIcon} ${n.id}: ${n.title} [${n.type}] P${n.priority}${marker}`);

    const children = n.children ?? [];
    const childPrefix = isRoot ? '' : prefix + (isLast ? '   ' : '│  ');
    children.forEach((child, index) => {
      const childIsLast = index === children.length - 1;
      formatNode(child, childPrefix, childIsLast, false);
    });
  };

  formatNode(node, '', true, true);

  return lines.join('\n');
}
