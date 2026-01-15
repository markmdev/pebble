import { Command } from 'commander';
import { getOrCreatePebbleDir } from '../lib/storage.js';
import { getIssue, getIssues, resolveId } from '../lib/state.js';
import { outputError, formatJson } from '../lib/output.js';
import type { Issue } from '../../shared/types.js';

export function graphCommand(program: Command): void {
  program
    .command('graph')
    .description('Show dependency graph')
    .option('--root <id>', 'Filter to subtree rooted at issue')
    .action(async (options) => {
      const pretty = program.opts().pretty ?? false;

      try {
        // Auto-init .pebble/ if it doesn't exist
        getOrCreatePebbleDir();

        let issues: Issue[];

        if (options.root) {
          const rootId = resolveId(options.root);
          const rootIssue = getIssue(rootId);
          if (!rootIssue) {
            throw new Error(`Issue not found: ${options.root}`);
          }
          // Get all issues in the subtree
          issues = getSubtree(rootId);
        } else {
          issues = getIssues({});
        }

        if (pretty) {
          console.log(formatGraphPretty(issues));
        } else {
          console.log(formatJson({
            nodes: issues.map((i) => ({
              id: i.id,
              title: i.title,
              status: i.status,
              blockedBy: i.blockedBy,
            })),
          }));
        }
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });
}

function getSubtree(rootId: string): Issue[] {
  // Get all issues to build reverse lookup maps
  const allIssues = getIssues({});
  const issueMap = new Map(allIssues.map((i) => [i.id, i]));
  const neighborhood = new Set<string>();

  // Traverse upstream: what blocks this issue (recursively)
  function traverseUpstream(id: string) {
    if (neighborhood.has(id)) return;
    neighborhood.add(id);
    const issue = issueMap.get(id);
    if (issue) {
      // Blockers
      for (const blockerId of issue.blockedBy) {
        traverseUpstream(blockerId);
      }
      // Parent
      if (issue.parent) {
        traverseUpstream(issue.parent);
      }
    }
  }

  // Traverse downstream: what this issue blocks (recursively)
  function traverseDownstream(id: string) {
    if (neighborhood.has(id)) return;
    neighborhood.add(id);
    // Find issues blocked by this one
    for (const issue of allIssues) {
      if (issue.blockedBy.includes(id)) {
        traverseDownstream(issue.id);
      }
      // Find children
      if (issue.parent === id) {
        traverseDownstream(issue.id);
      }
    }
  }

  traverseUpstream(rootId);
  traverseDownstream(rootId);

  // Return issues in the neighborhood
  return allIssues.filter((i) => neighborhood.has(i.id));
}

function formatGraphPretty(issues: Issue[]): string {
  if (issues.length === 0) {
    return 'No issues found.';
  }

  const lines: string[] = [];
  lines.push('Dependency Graph');
  lines.push('================');
  lines.push('');

  // Build adjacency maps
  const blockedByMap = new Map<string, string[]>();
  const blockingMap = new Map<string, string[]>();
  const issueMap = new Map<string, Issue>();

  for (const issue of issues) {
    issueMap.set(issue.id, issue);
    blockedByMap.set(issue.id, issue.blockedBy);

    for (const blockerId of issue.blockedBy) {
      if (!blockingMap.has(blockerId)) {
        blockingMap.set(blockerId, []);
      }
      blockingMap.get(blockerId)!.push(issue.id);
    }
  }

  // Calculate levels using topological sort
  const levels = new Map<string, number>();
  const visited = new Set<string>();

  function calculateLevel(id: string): number {
    if (levels.has(id)) return levels.get(id)!;
    if (visited.has(id)) return 0; // Cycle protection
    visited.add(id);

    const blockedBy = blockedByMap.get(id) || [];
    let maxBlockerLevel = -1;
    for (const blockerId of blockedBy) {
      const blockerLevel = calculateLevel(blockerId);
      maxBlockerLevel = Math.max(maxBlockerLevel, blockerLevel);
    }

    const level = maxBlockerLevel + 1;
    levels.set(id, level);
    return level;
  }

  for (const issue of issues) {
    calculateLevel(issue.id);
  }

  // Group by level
  const byLevel = new Map<number, Issue[]>();
  for (const issue of issues) {
    const level = levels.get(issue.id) || 0;
    if (!byLevel.has(level)) {
      byLevel.set(level, []);
    }
    byLevel.get(level)!.push(issue);
  }

  // Print by level
  const maxLevel = Math.max(...Array.from(levels.values()));
  for (let level = 0; level <= maxLevel; level++) {
    const levelIssues = byLevel.get(level) || [];
    if (levelIssues.length === 0) continue;

    lines.push(`Level ${level}:`);
    for (const issue of levelIssues) {
      const statusIcon = issue.status === 'closed' ? '✓' : '○';
      const blockers = issue.blockedBy.length > 0 ? ` ← [${issue.blockedBy.join(', ')}]` : '';
      lines.push(`  ${statusIcon} ${issue.id} - ${issue.title}${blockers}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
