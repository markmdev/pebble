import { Command } from 'commander';
import { getOrCreatePebbleDir } from '../lib/storage.js';
import { getIssue, resolveId, getVerifications } from '../lib/state.js';
import { outputError, formatJson } from '../lib/output.js';

export function verificationsCommand(program: Command): void {
  program
    .command('verifications <id>')
    .description('List verification issues for a given issue')
    .action(async (id: string) => {
      const pretty = program.opts().pretty ?? false;

      try {
        // Ensure pebble directory exists
        getOrCreatePebbleDir();

        const resolvedId = resolveId(id);
        const issue = getIssue(resolvedId);

        if (!issue) {
          throw new Error(`Issue not found: ${id}`);
        }

        const verifications = getVerifications(resolvedId);

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
          }
        } else {
          console.log(formatJson({
            issueId: resolvedId,
            verifications: verifications.map((v) => ({
              id: v.id,
              title: v.title,
              status: v.status,
            })),
          }));
        }
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });
}
