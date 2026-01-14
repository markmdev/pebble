import { Command } from 'commander';
import type { UpdateEvent } from '../../shared/types.js';
import { getOrCreatePebbleDir, appendEvent } from '../lib/storage.js';
import { getIssue, resolveId } from '../lib/state.js';
import { outputMutationSuccess, outputError, formatJson } from '../lib/output.js';

export function claimCommand(program: Command): void {
  program
    .command('claim <ids...>')
    .description('Claim issues (set status to in_progress). Supports multiple IDs.')
    .action(async (ids: string[]) => {
      const pretty = program.opts().pretty ?? false;

      try {
        const pebbleDir = getOrCreatePebbleDir();

        // Support comma-separated IDs: "ID1,ID2,ID3" or "ID1 ID2 ID3"
        const allIds = ids.flatMap(id => id.split(',').map(s => s.trim()).filter(Boolean));

        if (allIds.length === 0) {
          throw new Error('No issue IDs provided');
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

            if (issue.status === 'in_progress') {
              results.push({ id: resolvedId, success: true });
              continue;
            }

            if (issue.status === 'closed') {
              results.push({ id: resolvedId, success: false, error: `Cannot claim closed issue: ${resolvedId}` });
              continue;
            }

            const event: UpdateEvent = {
              type: 'update',
              issueId: resolvedId,
              timestamp: new Date().toISOString(),
              data: {
                status: 'in_progress',
              },
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
