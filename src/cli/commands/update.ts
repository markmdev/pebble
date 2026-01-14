import { Command } from 'commander';
import type { Priority, Status, UpdateEvent } from '../../shared/types.js';
import { PRIORITIES, STATUSES } from '../../shared/types.js';
import { getOrCreatePebbleDir, appendEvent } from '../lib/storage.js';
import { getIssue, resolveId } from '../lib/state.js';
import { outputMutationSuccess, outputError, formatJson } from '../lib/output.js';

export function updateCommand(program: Command): void {
  program
    .command('update <ids...>')
    .description('Update issues. Supports multiple IDs.')
    .option('--status <status>', 'Status (open, in_progress, blocked, closed)')
    .option('--priority <priority>', 'Priority (0-4)')
    .option('--title <title>', 'Title')
    .option('--description <desc>', 'Description')
    .action(async (ids: string[], options) => {
      const pretty = program.opts().pretty ?? false;

      try {
        const pebbleDir = getOrCreatePebbleDir();

        // Support comma-separated IDs: "ID1,ID2,ID3" or "ID1 ID2 ID3"
        const allIds = ids.flatMap(id => id.split(',').map(s => s.trim()).filter(Boolean));

        if (allIds.length === 0) {
          throw new Error('No issue IDs provided');
        }

        // Validate options once (they apply to all)
        const data: UpdateEvent['data'] = {};
        let hasChanges = false;

        if (options.status !== undefined) {
          const status = options.status as Status;
          if (!STATUSES.includes(status)) {
            throw new Error(`Invalid status: ${status}. Must be one of: ${STATUSES.join(', ')}`);
          }
          data.status = status;
          hasChanges = true;
        }

        if (options.priority !== undefined) {
          const priority = parseInt(options.priority, 10) as Priority;
          if (!PRIORITIES.includes(priority)) {
            throw new Error(`Invalid priority: ${options.priority}. Must be 0-4`);
          }
          data.priority = priority;
          hasChanges = true;
        }

        if (options.title !== undefined) {
          data.title = options.title;
          hasChanges = true;
        }

        if (options.description !== undefined) {
          data.description = options.description;
          hasChanges = true;
        }

        if (!hasChanges) {
          throw new Error('No changes specified. Use --status, --priority, --title, or --description');
        }

        const results: Array<{ id: string; success: boolean; error?: string }> = [];

        for (const id of allIds) {
          try {
            const resolvedId = resolveId(id);
            const issue = getIssue(resolvedId);

            if (!issue) {
              results.push({ id, success: false, error: `Issue not found: ${id}` });
              continue;
            }

            const event: UpdateEvent = {
              type: 'update',
              issueId: resolvedId,
              timestamp: new Date().toISOString(),
              data,
            };

            appendEvent(event, pebbleDir);
            results.push({ id: resolvedId, success: true });
          } catch (error) {
            results.push({ id, success: false, error: (error as Error).message });
          }
        }

        // Output results
        if (allIds.length === 1) {
          // Single issue - output success or error
          const result = results[0];
          if (result.success) {
            outputMutationSuccess(result.id, pretty);
          } else {
            throw new Error(result.error || 'Unknown error');
          }
        } else {
          // Multiple issues - output array of results
          if (pretty) {
            for (const result of results) {
              if (result.success) {
                console.log(`✓ ${result.id}`);
              } else {
                console.log(`✗ ${result.id}: ${result.error}`);
              }
            }
          } else {
            console.log(formatJson(results.map(r => ({
              id: r.id,
              success: r.success,
              ...(r.error && { error: r.error }),
            }))));
          }
        }
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });
}
