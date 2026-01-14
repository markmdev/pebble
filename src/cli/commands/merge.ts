import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { readEventsFromFile } from '../lib/storage.js';
import { computeState } from '../lib/state.js';
import type { Issue, IssueEvent } from '../../shared/types.js';

interface MergedIssue extends Issue {
  _sources: string[];
}

/**
 * Merge events from multiple files, keeping all events sorted by timestamp
 */
function mergeEvents(filePaths: string[]): IssueEvent[] {
  const allEvents: Array<IssueEvent & { _source: string }> = [];

  for (const filePath of filePaths) {
    const events = readEventsFromFile(filePath);
    for (const event of events) {
      allEvents.push({ ...event, _source: filePath });
    }
  }

  // Sort by timestamp
  allEvents.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Return events without _source annotation for clean output
  return allEvents.map(({ _source, ...event }) => event);
}

/**
 * Merge issues from multiple files.
 * Same ID = same issue: keep the version with the latest updatedAt.
 */
function mergeIssues(filePaths: string[]): MergedIssue[] {
  const merged = new Map<string, { issue: Issue; sources: Set<string> }>();

  for (const filePath of filePaths) {
    const events = readEventsFromFile(filePath);
    const state = computeState(events);

    for (const [id, issue] of state) {
      const existing = merged.get(id);
      if (!existing) {
        merged.set(id, { issue, sources: new Set([filePath]) });
      } else {
        existing.sources.add(filePath);
        if (new Date(issue.updatedAt) > new Date(existing.issue.updatedAt)) {
          merged.set(id, { issue, sources: existing.sources });
        }
      }
    }
  }

  return Array.from(merged.values()).map(({ issue, sources }) => ({
    ...issue,
    _sources: Array.from(sources),
  }));
}

export function mergeCommand(program: Command): void {
  program
    .command('merge <files...>')
    .description('Merge multiple issues.jsonl files into one')
    .option('-o, --output <file>', 'Output file (default: stdout)')
    .option('--events', 'Output raw events instead of computed state')
    .option('--show-sources', 'Include _sources field showing which files contained each issue')
    .action((files: string[], options) => {
      const pretty = program.opts().pretty ?? false;

      // Resolve and validate file paths
      const filePaths: string[] = [];
      for (const file of files) {
        const resolved = path.resolve(process.cwd(), file);
        if (!fs.existsSync(resolved)) {
          console.error(`Error: File not found: ${file}`);
          process.exit(1);
        }
        filePaths.push(resolved);
      }

      if (filePaths.length < 2) {
        console.error('Error: At least 2 files required for merge');
        process.exit(1);
      }

      try {
        let output: string;

        if (options.events) {
          // Output merged events as JSONL
          const events = mergeEvents(filePaths);
          output = events.map((e) => JSON.stringify(e)).join('\n') + '\n';
        } else {
          // Output computed state as JSON array
          const issues = mergeIssues(filePaths);

          // Remove _sources unless requested
          const outputIssues = options.showSources
            ? issues
            : issues.map(({ _sources, ...issue }) => issue);

          output = pretty
            ? JSON.stringify(outputIssues, null, 2)
            : JSON.stringify(outputIssues);
        }

        if (options.output) {
          fs.writeFileSync(options.output, output + '\n', 'utf-8');
          console.error(`Merged ${filePaths.length} files to ${options.output}`);
        } else {
          console.log(output);
        }
      } catch (error) {
        console.error(`Error: ${(error as Error).message}`);
        process.exit(1);
      }
    });
}
