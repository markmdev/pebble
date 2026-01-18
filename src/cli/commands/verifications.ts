import { Command } from 'commander';
import { getOrCreatePebbleDir } from '../lib/storage.js';
import { getIssue, resolveId, getVerifications } from '../lib/state.js';
import { outputError, formatJson, formatLimitMessage, type LimitInfo } from '../lib/output.js';

export function verificationsCommand(program: Command): void {
  program
    .command('verifications <id>')
    .description('List verification issues for a given issue')
    .option('--limit <n>', 'Max verifications to return (default: 30)')
    .option('--all', 'Show all verifications (no limit)')
    .action(async (id: string, options) => {
      const pretty = program.opts().pretty ?? false;

      try {
        // Ensure pebble directory exists
        getOrCreatePebbleDir();

        const resolvedId = resolveId(id);
        const issue = getIssue(resolvedId);

        if (!issue) {
          throw new Error(`Issue not found: ${id}`);
        }

        let verifications = getVerifications(resolvedId);

        // Sort by createdAt descending (newest first)
        verifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        // Apply limit
        const total = verifications.length;
        const limit = options.all ? 0 : (options.limit ? parseInt(options.limit, 10) : 30);
        if (limit > 0 && verifications.length > limit) {
          verifications = verifications.slice(0, limit);
        }
        const limitInfo: LimitInfo = {
          total,
          shown: verifications.length,
          limited: limit > 0 && total > limit,
        };

        if (pretty) {
          if (verifications.length === 0) {
            console.log(`No verifications for ${resolvedId}`);
          } else {
            console.log(`Verifications for ${resolvedId} "${issue.title}"`);
            console.log('─'.repeat(50));
            for (const v of verifications) {
              const status = v.status === 'closed' ? '✓' : '○';
              console.log(`  ${status} ${v.id} - ${v.title}`);
            }
            console.log('');
            console.log(`Total: ${verifications.length} verification(s)`);
            if (limitInfo.limited) {
              console.log(formatLimitMessage(limitInfo));
            }
          }
        } else {
          const output = {
            issueId: resolvedId,
            verifications: verifications.map((v) => ({
              id: v.id,
              title: v.title,
              status: v.status,
            })),
            ...(limitInfo.limited && { _meta: limitInfo }),
          };
          console.log(formatJson(output));
        }
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });
}
