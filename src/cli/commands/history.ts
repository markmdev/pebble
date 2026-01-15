import { Command } from 'commander';
import type { EventType } from '../../shared/types.js';
import { EVENT_TYPES } from '../../shared/types.js';
import { getOrCreatePebbleDir, readEvents } from '../lib/storage.js';
import { computeState } from '../lib/state.js';
import { outputError, formatJson } from '../lib/output.js';

interface HistoryEntry {
  timestamp: string;
  event: EventType;
  issue: {
    id: string;
    title: string;
    type: string;
  };
  parent?: {
    id: string;
    title: string;
  };
  details?: Record<string, unknown>;
}

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)([dhms])$/);
  if (!match) {
    throw new Error(`Invalid duration: ${duration}. Use format like "7d", "24h", "30m", "60s"`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };

  return value * multipliers[unit];
}

function formatRelativeTime(timestamp: string): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const diff = now - then;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
}

function formatHistoryPretty(entries: HistoryEntry[]): string {
  if (entries.length === 0) {
    return 'No events found.';
  }

  const lines: string[] = [];

  for (const entry of entries) {
    const time = formatRelativeTime(entry.timestamp);
    const eventLabel = entry.event.charAt(0).toUpperCase() + entry.event.slice(1);

    let line = `[${time}] ${eventLabel} ${entry.issue.id} "${entry.issue.title}" (${entry.issue.type})`;

    if (entry.parent) {
      line += ` under ${entry.parent.id}`;
    }

    lines.push(line);
  }

  return lines.join('\n');
}

export function historyCommand(program: Command): void {
  program
    .command('history')
    .description('Show recent activity log')
    .option('--limit <n>', 'Max events to return', '20')
    .option('--type <types>', 'Filter by event type(s), comma-separated (create,close,reopen,update,comment)')
    .option('--since <duration>', 'Only show events since (e.g., "7d", "24h")')
    .action(async (options) => {
      const pretty = program.opts().pretty ?? false;

      try {
        getOrCreatePebbleDir();

        const events = readEvents();
        const state = computeState(events);

        // Filter by type(s)
        let filteredEvents = events;
        if (options.type !== undefined) {
          const types = options.type.split(',').map((t: string) => t.trim());
          // Validate each type
          for (const t of types) {
            if (!EVENT_TYPES.includes(t as EventType)) {
              throw new Error(`Invalid event type: ${t}. Must be one of: ${EVENT_TYPES.join(', ')}`);
            }
          }
          filteredEvents = filteredEvents.filter((e) => types.includes(e.type));
        }

        // Filter by time
        if (options.since !== undefined) {
          const sinceMs = parseDuration(options.since);
          const cutoff = Date.now() - sinceMs;
          filteredEvents = filteredEvents.filter(
            (e) => new Date(e.timestamp).getTime() >= cutoff
          );
        }

        // Sort by timestamp descending (newest first)
        filteredEvents.sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        );

        // Apply limit
        const limit = parseInt(options.limit, 10);
        if (limit > 0) {
          filteredEvents = filteredEvents.slice(0, limit);
        }

        // Build history entries
        const entries: HistoryEntry[] = filteredEvents.map((event) => {
          const issue = state.get(event.issueId);
          const entry: HistoryEntry = {
            timestamp: event.timestamp,
            event: event.type,
            issue: {
              id: event.issueId,
              title: issue?.title ?? '(unknown)',
              type: issue?.type ?? 'task',
            },
          };

          // Add parent info if available
          if (issue?.parent) {
            const parent = state.get(issue.parent);
            if (parent) {
              entry.parent = {
                id: parent.id,
                title: parent.title,
              };
            }
          }

          // Add event-specific details
          if (event.type === 'close' && event.data.reason) {
            entry.details = { reason: event.data.reason };
          } else if (event.type === 'comment') {
            entry.details = { text: event.data.text };
          }

          return entry;
        });

        if (pretty) {
          console.log(formatHistoryPretty(entries));
        } else {
          console.log(formatJson(entries));
        }
      } catch (error) {
        outputError(error as Error, pretty);
      }
    });
}
