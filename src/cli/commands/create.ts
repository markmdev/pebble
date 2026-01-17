import { Command } from 'commander';
import type { IssueType, Priority, CreateEvent, UpdateEvent } from '../../shared/types.js';
import { ISSUE_TYPES, PRIORITIES } from '../../shared/types.js';
import { getOrCreatePebbleDir, getConfig, appendEvent } from '../lib/storage.js';
import { generateId } from '../lib/id.js';
import { getIssue, resolveId } from '../lib/state.js';
import { outputMutationSuccess, outputError } from '../lib/output.js';

export function createCommand(program: Command): void {
  program
    .command('create <title>')
    .description('Create a new issue')
    .option('-t, --type <type>', 'Issue type (task, bug, epic, verification)', 'task')
    .option('-p, --priority <priority>', 'Priority (0-4)', '2')
    .option('-d, --description <desc>', 'Description')
    .option('--parent <id>', 'Parent epic ID')
    .option('--verifies <id>', 'ID of issue this verifies (sets type to verification)')
    .option('--blocked-by <ids>', 'Comma-separated IDs of issues that block this one')
    .option('--blocks <ids>', 'Comma-separated IDs of issues this one will block')
    .action(async (title: string, options) => {
      const pretty = program.opts().pretty ?? false;

      try {
        // Auto-set type to verification if --verifies is used
        let type = options.type as IssueType;
        if (options.verifies && type !== 'verification') {
          type = 'verification';
        }

        // Validate type
        if (!ISSUE_TYPES.includes(type)) {
          throw new Error(`Invalid type: ${type}. Must be one of: ${ISSUE_TYPES.join(', ')}`);
        }

        // Validate --verifies is only used with verification type
        if (type === 'verification' && !options.verifies) {
          throw new Error('Verification issues require --verifies <id> to specify the issue being verified');
        }

        // Validate priority
        const priority = parseInt(options.priority, 10) as Priority;
        if (!PRIORITIES.includes(priority)) {
          throw new Error(`Invalid priority: ${options.priority}. Must be 0-4`);
        }

        // Get or create pebble directory
        const pebbleDir = getOrCreatePebbleDir();
        const config = getConfig(pebbleDir);

        // Resolve parent if provided
        let parentId: string | undefined;
        if (options.parent) {
          parentId = resolveId(options.parent);
          const parent = getIssue(parentId);
          if (!parent) {
            throw new Error(`Parent issue not found: ${options.parent}`);
          }
          if (parent.type !== 'epic') {
            throw new Error(`Parent must be an epic, got: ${parent.type}`);
          }
          if (parent.status === 'closed') {
            throw new Error(`Cannot add children to closed epic: ${parentId}`);
          }
        }

        // Resolve verifies if provided
        let verifiesId: string | undefined;
        if (options.verifies) {
          verifiesId = resolveId(options.verifies);
          const target = getIssue(verifiesId);
          if (!target) {
            throw new Error(`Target issue not found: ${options.verifies}`);
          }
        }

        // Resolve --blocked-by (issues that block this new issue)
        const blockedByIds: string[] = [];
        if (options.blockedBy) {
          const ids = options.blockedBy.split(',').map((s: string) => s.trim()).filter(Boolean);
          for (const rawId of ids) {
            const resolvedId = resolveId(rawId);
            const blocker = getIssue(resolvedId);
            if (!blocker) {
              throw new Error(`Blocker issue not found: ${rawId}`);
            }
            if (blocker.status === 'closed') {
              throw new Error(`Cannot be blocked by closed issue: ${resolvedId}`);
            }
            blockedByIds.push(resolvedId);
          }
        }

        // Resolve --blocks (issues this new issue will block)
        const blocksIds: string[] = [];
        if (options.blocks) {
          const ids = options.blocks.split(',').map((s: string) => s.trim()).filter(Boolean);
          for (const rawId of ids) {
            const resolvedId = resolveId(rawId);
            const blocked = getIssue(resolvedId);
            if (!blocked) {
              throw new Error(`Issue to block not found: ${rawId}`);
            }
            blocksIds.push(resolvedId);
          }
        }

        // Generate ID and create event
        const id = generateId(config.prefix);
        const timestamp = new Date().toISOString();

        const event: CreateEvent = {
          type: 'create',
          issueId: id,
          timestamp,
          data: {
            title,
            type,
            priority,
            description: options.description,
            parent: parentId,
            verifies: verifiesId,
          },
        };

        appendEvent(event, pebbleDir);

        // Add dependencies via UpdateEvents
        // --blocked-by: Set this issue's blockedBy array
        if (blockedByIds.length > 0) {
          const depEvent: UpdateEvent = {
            type: 'update',
            issueId: id,
            timestamp: new Date().toISOString(),
            data: { blockedBy: blockedByIds },
          };
          appendEvent(depEvent, pebbleDir);
        }

        // --blocks: Add this issue to each target's blockedBy array
        for (const targetId of blocksIds) {
          const target = getIssue(targetId);
          const existingBlockers = target?.blockedBy || [];
          const depEvent: UpdateEvent = {
            type: 'update',
            issueId: targetId,
            timestamp: new Date().toISOString(),
            data: { blockedBy: [...existingBlockers, id] },
          };
          appendEvent(depEvent, pebbleDir);
        }

        // Output success
        outputMutationSuccess(id, pretty);
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });
}
