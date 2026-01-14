import { Command } from 'commander';
import * as fs from 'fs';
import * as readline from 'readline';
import type { IssueType, Priority, Status, CreateEvent, UpdateEvent, CloseEvent, CommentEvent } from '../../shared/types.js';
import { ensurePebbleDir, appendEvent } from '../lib/storage.js';
import { outputError, formatJson } from '../lib/output.js';
import { derivePrefix } from '../lib/id.js';
import * as path from 'path';

// Beads issue format
interface BeadsDependency {
  issue_id: string;
  depends_on_id: string;
  type: 'blocks' | 'parent-child' | 'related' | 'discovered-from';
  created_at: string;
  created_by?: string;
}

interface BeadsIssue {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: number;
  issue_type: string;
  assignee?: string;
  created_at: string;
  created_by?: string;
  updated_at: string;
  closed_at?: string;
  close_reason?: string;
  dependencies?: BeadsDependency[];
}

export function importCommand(program: Command): void {
  program
    .command('import <file>')
    .description('Import issues from a Beads issues.jsonl file')
    .option('--dry-run', 'Show what would be imported without writing')
    .option('--prefix <prefix>', 'Override the ID prefix (default: derive from folder name)')
    .action(async (file: string, options) => {
      const pretty = program.opts().pretty ?? false;

      try {
        // Validate file exists
        if (!fs.existsSync(file)) {
          throw new Error(`File not found: ${file}`);
        }

        // Read and parse Beads issues
        const beadsIssues = await parseBeadsFile(file);

        if (beadsIssues.length === 0) {
          console.log(pretty ? 'No issues found in file.' : formatJson({ imported: 0 }));
          return;
        }

        // Determine prefix
        const prefix = options.prefix ?? derivePrefix(path.basename(process.cwd()));

        // Convert to pebble events
        const { events, idMap, stats } = convertToPebbleEvents(beadsIssues, prefix);

        if (options.dryRun) {
          if (pretty) {
            console.log('Dry run - would import:');
            console.log(`  ${stats.created} issues`);
            console.log(`  ${stats.closed} closed issues`);
            console.log(`  ${stats.dependencies} block dependencies`);
            console.log(`  ${stats.parentChild} parent-child relationships`);
            console.log(`  ${stats.comments} comments`);
            console.log('\nID mapping (beads -> pebble):');
            for (const [beadsId, pebbleId] of idMap) {
              console.log(`  ${beadsId} -> ${pebbleId}`);
            }
          } else {
            console.log(formatJson({
              dryRun: true,
              stats,
              idMap: Object.fromEntries(idMap),
            }));
          }
          return;
        }

        // Ensure pebble directory exists
        const pebbleDir = ensurePebbleDir();

        // Write events
        for (const event of events) {
          appendEvent(event, pebbleDir);
        }

        if (pretty) {
          console.log(`Imported ${stats.created} issues from ${file}`);
          console.log(`  ${stats.closed} closed`);
          console.log(`  ${stats.dependencies} block dependencies`);
          console.log(`  ${stats.parentChild} parent-child relationships`);
          console.log(`  ${stats.comments} comments`);
        } else {
          console.log(formatJson({
            imported: stats.created,
            closed: stats.closed,
            dependencies: stats.dependencies,
            parentChild: stats.parentChild,
            comments: stats.comments,
            idMap: Object.fromEntries(idMap),
          }));
        }
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });
}

async function parseBeadsFile(filePath: string): Promise<BeadsIssue[]> {
  const issues: BeadsIssue[] = [];

  const fileStream = fs.createReadStream(filePath);
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim()) {
      try {
        const issue = JSON.parse(line) as BeadsIssue;
        issues.push(issue);
      } catch {
        // Skip malformed lines
      }
    }
  }

  return issues;
}

function convertToPebbleEvents(
  beadsIssues: BeadsIssue[],
  prefix: string
): {
  events: (CreateEvent | UpdateEvent | CloseEvent | CommentEvent)[];
  idMap: Map<string, string>;
  stats: { created: number; closed: number; dependencies: number; comments: number; parentChild: number };
} {
  const events: (CreateEvent | UpdateEvent | CloseEvent | CommentEvent)[] = [];
  const idMap = new Map<string, string>();
  const issueTypeMap = new Map<string, string>(); // beadsId -> issue_type
  const stats = { created: 0, closed: 0, dependencies: 0, comments: 0, parentChild: 0 };

  // First pass: create ID mapping and type mapping
  for (const issue of beadsIssues) {
    const suffix = generateSuffix();
    const pebbleId = `${prefix}-${suffix}`;
    idMap.set(issue.id, pebbleId);
    issueTypeMap.set(issue.id, issue.issue_type);
  }

  // Second pass: create events
  for (const issue of beadsIssues) {
    const pebbleId = idMap.get(issue.id)!;

    // Map type (feature, chore -> task)
    let type: IssueType = 'task';
    if (issue.issue_type === 'bug') {
      type = 'bug';
    } else if (issue.issue_type === 'epic') {
      type = 'epic';
    }

    // Map priority (clamp to 0-4)
    const priority = Math.max(0, Math.min(4, issue.priority)) as Priority;

    // Extract parent from dependencies
    let parent: string | undefined;
    const blockedBy: string[] = [];

    if (issue.dependencies) {
      for (const dep of issue.dependencies) {
        if (dep.type === 'parent-child') {
          // Beads stores parent-child on BOTH sides (child->parent AND parent->child)
          // Only process when depends_on_id points to an epic (this issue is a child of that epic)
          // Skip when depends_on_id points to a non-epic (that's the reverse relationship)
          const targetType = issueTypeMap.get(dep.depends_on_id);
          if (targetType === 'epic') {
            const parentPebbleId = idMap.get(dep.depends_on_id);
            if (parentPebbleId) {
              parent = parentPebbleId;
              stats.parentChild++;
            }
          }
          // If targetType is not 'epic', skip - handled when processing the child issue
        } else if (dep.type === 'blocks' && dep.depends_on_id !== issue.id) {
          // This issue is blocked by depends_on_id
          const blockerPebbleId = idMap.get(dep.depends_on_id);
          if (blockerPebbleId) {
            blockedBy.push(blockerPebbleId);
            stats.dependencies++;
          }
        }
      }
    }

    // Create event
    const createEvent: CreateEvent = {
      type: 'create',
      issueId: pebbleId,
      timestamp: issue.created_at,
      data: {
        title: issue.title,
        type,
        priority,
        description: issue.description,
        parent,
      },
    };
    events.push(createEvent);
    stats.created++;

    // Add blockedBy if any
    if (blockedBy.length > 0) {
      const updateEvent: UpdateEvent = {
        type: 'update',
        issueId: pebbleId,
        timestamp: issue.created_at,
        data: {
          blockedBy,
        },
      };
      events.push(updateEvent);
    }

    // Map status (deferred -> open, blocked stays blocked)
    let status: Status = 'open';
    if (issue.status === 'in_progress') {
      status = 'in_progress';
    } else if (issue.status === 'blocked') {
      status = 'blocked';
    } else if (issue.status === 'closed') {
      status = 'closed';
    }
    // 'deferred' and 'open' both map to 'open'

    // Update status if not open
    if (status !== 'open' && status !== 'closed') {
      const statusEvent: UpdateEvent = {
        type: 'update',
        issueId: pebbleId,
        timestamp: issue.updated_at,
        data: {
          status,
        },
      };
      events.push(statusEvent);
    }

    // Close event if closed
    if (status === 'closed') {
      const closeEvent: CloseEvent = {
        type: 'close',
        issueId: pebbleId,
        timestamp: issue.closed_at ?? issue.updated_at,
        data: {
          reason: issue.close_reason,
        },
      };
      events.push(closeEvent);
      stats.closed++;
    }
  }

  return { events, idMap, stats };
}

function generateSuffix(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}
