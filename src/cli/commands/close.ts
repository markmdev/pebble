import { Command } from 'commander';
import type { CloseEvent, CommentEvent } from '../../shared/types.js';
import { getOrCreatePebbleDir, appendEvent } from '../lib/storage.js';
import { getIssue, resolveId, hasOpenChildren, getNewlyUnblocked } from '../lib/state.js';
import { outputError, formatJson } from '../lib/output.js';

export function closeCommand(program: Command): void {
  program
    .command('close <ids...>')
    .description('Close issues. Supports multiple IDs.')
    .option('--reason <reason>', 'Reason for closing')
    .option('--comment <text>', 'Add a comment before closing')
    .action(async (ids: string[], options) => {
      const pretty = program.opts().pretty ?? false;

      try {
        const pebbleDir = getOrCreatePebbleDir();

        // Support comma-separated IDs: "ID1,ID2,ID3" or "ID1 ID2 ID3"
        const allIds = ids.flatMap(id => id.split(',').map(s => s.trim()).filter(Boolean));

        if (allIds.length === 0) {
          throw new Error('No issue IDs provided');
        }

        const results: Array<{ id: string; success: boolean; error?: string; unblocked?: Array<{ id: string; title: string }> }> = [];

        for (const id of allIds) {
          try {
            const resolvedId = resolveId(id);
            const issue = getIssue(resolvedId);

            if (!issue) {
              results.push({ id, success: false, error: `Issue not found: ${id}` });
              continue;
            }

            if (issue.status === 'closed') {
              results.push({ id: resolvedId, success: false, error: `Issue is already closed: ${resolvedId}` });
              continue;
            }

            // Check if epic has open children
            if (issue.type === 'epic' && hasOpenChildren(resolvedId)) {
              results.push({ id: resolvedId, success: false, error: `Cannot close epic with open children: ${resolvedId}` });
              continue;
            }

            const timestamp = new Date().toISOString();

            // Add comment first if provided
            if (options.comment) {
              const commentEvent: CommentEvent = {
                type: 'comment',
                issueId: resolvedId,
                timestamp,
                data: {
                  text: options.comment,
                  timestamp,
                },
              };
              appendEvent(commentEvent, pebbleDir);
            }

            // Then close
            const closeEvent: CloseEvent = {
              type: 'close',
              issueId: resolvedId,
              timestamp,
              data: {
                reason: options.reason,
              },
            };

            appendEvent(closeEvent, pebbleDir);

            // Get issues that became unblocked
            const unblocked = getNewlyUnblocked(resolvedId);
            results.push({
              id: resolvedId,
              success: true,
              unblocked: unblocked.length > 0 ? unblocked.map(i => ({ id: i.id, title: i.title })) : undefined,
            });
          } catch (error) {
            results.push({ id, success: false, error: (error as Error).message });
          }
        }

        // Output results
        if (allIds.length === 1) {
          // Single issue - output success or error
          const result = results[0];
          if (result.success) {
            if (pretty) {
              console.log(`✓ ${result.id}`);
              if (result.unblocked && result.unblocked.length > 0) {
                console.log(`\nUnblocked:`);
                for (const u of result.unblocked) {
                  console.log(`  → ${u.id} - ${u.title}`);
                }
              }
            } else {
              console.log(formatJson({
                id: result.id,
                success: true,
                ...(result.unblocked && { unblocked: result.unblocked }),
              }));
            }
          } else {
            throw new Error(result.error || 'Unknown error');
          }
        } else {
          // Multiple issues - output array of results
          if (pretty) {
            for (const result of results) {
              if (result.success) {
                console.log(`✓ ${result.id}`);
                if (result.unblocked && result.unblocked.length > 0) {
                  for (const u of result.unblocked) {
                    console.log(`  → ${u.id} - ${u.title}`);
                  }
                }
              } else {
                console.log(`✗ ${result.id}: ${result.error}`);
              }
            }
          } else {
            console.log(formatJson(results.map(r => ({
              id: r.id,
              success: r.success,
              ...(r.error && { error: r.error }),
              ...(r.unblocked && { unblocked: r.unblocked }),
            }))));
          }
        }
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });
}
