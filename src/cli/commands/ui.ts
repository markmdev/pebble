import { Command } from 'commander';
import express, { Response } from 'express';
import cors from 'cors';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import net from 'net';
import open from 'open';
import chokidar from 'chokidar';
import {
  getIssues,
  getIssue,
  resolveId,
  hasOpenChildren,
  detectCycle,
  computeState,
} from '../lib/state.js';
import {
  readEvents,
  readEventsFromFile,
  getOrCreatePebbleDir,
  appendEvent,
  getConfig,
} from '../lib/storage.js';
import { generateId } from '../lib/id.js';
import { outputError } from '../lib/output.js';
import type {
  CreateEvent,
  UpdateEvent,
  CloseEvent,
  ReopenEvent,
  CommentEvent,
  IssueType,
  IssueEvent,
  Priority,
  Issue,
} from '../../shared/types.js';
import { ISSUE_TYPES, STATUSES, PRIORITIES } from '../../shared/types.js';

// Check if a port is available
function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

// Find an available port starting from the given port
async function findAvailablePort(startPort: number, maxAttempts = 10): Promise<number> {
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i;
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found (tried ${startPort}-${startPort + maxAttempts - 1})`);
}

// Multi-worktree: Issue with source tracking
interface IssueWithSource extends Issue {
  _sources: string[]; // File paths where this issue exists
}

// Multi-worktree: Event with source tracking
type IssueEventWithSource = IssueEvent & {
  _source: string; // File path where this event came from
};

/**
 * Read events from multiple files and annotate with source
 */
function readEventsFromFiles(filePaths: string[]): IssueEventWithSource[] {
  const allEvents: IssueEventWithSource[] = [];
  for (const filePath of filePaths) {
    const events = readEventsFromFile(filePath);
    for (const event of events) {
      allEvents.push({ ...event, _source: filePath });
    }
  }
  return allEvents;
}

/**
 * Merge issues from multiple files.
 * Same ID = same issue: keep the version with the latest updatedAt.
 * Tracks which file(s) contain each issue.
 */
function mergeIssuesFromFiles(filePaths: string[]): IssueWithSource[] {
  const merged = new Map<string, { issue: Issue; sources: Set<string> }>();

  for (const filePath of filePaths) {
    const events = readEventsFromFile(filePath);
    const state = computeState(events);

    for (const [id, issue] of state) {
      const existing = merged.get(id);
      if (!existing) {
        // First time seeing this issue
        merged.set(id, { issue, sources: new Set([filePath]) });
      } else {
        // Issue exists in multiple files - keep the one with latest updatedAt
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

export function uiCommand(program: Command): void {
  const defaultPort = process.env.PEBBLE_UI_PORT || '3333';

  program
    .command('ui')
    .description('Serve the React UI')
    .option('--port <port>', 'Port to serve on', defaultPort)
    .option('--no-open', 'Do not open browser automatically')
    .option('--files <paths>', 'Comma-separated paths to issues.jsonl files for multi-worktree view')
    .action(async (options) => {
      const pretty = program.opts().pretty ?? false;

      try {
        // Parse multi-worktree files option
        let issueFiles: string[] = [];
        if (options.files) {
          // Parse comma-separated paths
          issueFiles = options.files.split(',').map((p: string) => p.trim()).filter(Boolean);
          if (issueFiles.length === 0) {
            console.error('Error: --files option requires at least one path');
            process.exit(1);
          }
          // Resolve relative paths
          issueFiles = issueFiles.map((p: string) => path.resolve(process.cwd(), p));
          console.log(`Multi-worktree mode: watching ${issueFiles.length} file(s)`);
          for (const f of issueFiles) {
            console.log(`  - ${f}`);
          }
        } else {
          // Default: single file mode
          const pebbleDir = getOrCreatePebbleDir();
          issueFiles = [path.join(pebbleDir, 'issues.jsonl')];
        }

        // Auto-create .pebble if it doesn't exist (single file mode only)
        if (!options.files) {
          getOrCreatePebbleDir();
        }

        const app = express();

        // Middleware
        app.use(cors());
        app.use(express.json());

        // API routes
        // API routes - use multi-worktree merge when multiple files
        // This is now a function since issueFiles can change dynamically
        const isMultiWorktree = () => issueFiles.length > 1;

        // GET /api/sources - Returns available issue files (for multi-worktree)
        app.get('/api/sources', (_req, res) => {
          try {
            res.json({ files: issueFiles, isMultiWorktree: isMultiWorktree() });
          } catch (error) {
            res.status(500).json({ error: (error as Error).message });
          }
        });

        // POST /api/sources - Add a new issue file to watch
        app.post('/api/sources', (req, res) => {
          try {
            const { path: filePath } = req.body;
            if (!filePath || typeof filePath !== 'string') {
              res.status(400).json({ error: 'path is required' });
              return;
            }

            const resolved = path.resolve(process.cwd(), filePath);

            // Check if file exists
            if (!fs.existsSync(resolved)) {
              res.status(400).json({ error: `File not found: ${filePath}` });
              return;
            }

            // Check if already watching
            if (issueFiles.includes(resolved)) {
              res.status(400).json({ error: 'File already being watched' });
              return;
            }

            // Add to watched files
            issueFiles.push(resolved);
            watcher.add(resolved);

            console.log(`Added source: ${resolved}`);
            res.json({ files: issueFiles, isMultiWorktree: isMultiWorktree() });
          } catch (error) {
            res.status(500).json({ error: (error as Error).message });
          }
        });

        // DELETE /api/sources/:index - Remove a watched file
        app.delete('/api/sources/:index', (req, res) => {
          try {
            const index = parseInt(req.params.index, 10);
            if (isNaN(index) || index < 0 || index >= issueFiles.length) {
              res.status(400).json({ error: `Invalid index: ${req.params.index}` });
              return;
            }

            // Don't allow removing the last file
            if (issueFiles.length === 1) {
              res.status(400).json({ error: 'Cannot remove the last source file' });
              return;
            }

            const removed = issueFiles.splice(index, 1)[0];
            watcher.unwatch(removed);

            console.log(`Removed source: ${removed}`);
            res.json({ files: issueFiles, isMultiWorktree: isMultiWorktree() });
          } catch (error) {
            res.status(500).json({ error: (error as Error).message });
          }
        });

        app.get('/api/issues', (_req, res) => {
          try {
            if (isMultiWorktree()) {
              const issues = mergeIssuesFromFiles(issueFiles);
              res.json(issues);
            } else {
              const issues = getIssues({});
              res.json(issues);
            }
          } catch (error) {
            res.status(500).json({ error: (error as Error).message });
          }
        });

        app.get('/api/events', (_req, res) => {
          try {
            if (isMultiWorktree()) {
              const events = readEventsFromFiles(issueFiles);
              res.json(events);
            } else {
              // readEvents handles missing .pebble gracefully
              const events = readEvents();
              res.json(events);
            }
          } catch (error) {
            res.status(500).json({ error: (error as Error).message });
          }
        });

        // SSE endpoint for real-time updates
        const sseClients = new Set<Response>();
        let eventCounter = 0;

        app.get('/api/events/stream', (req, res) => {
          // Set up SSE headers
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          res.flushHeaders();

          // Add client to the set
          sseClients.add(res);

          // Send initial connection message with event ID
          eventCounter++;
          res.write(`id: ${eventCounter}\ndata: {"type":"connected"}\n\n`);

          // Remove client on close
          req.on('close', () => {
            sseClients.delete(res);
          });
        });

        // Heartbeat to keep connections alive (every 30 seconds)
        const heartbeatInterval = setInterval(() => {
          for (const client of sseClients) {
            client.write(': heartbeat\n\n'); // SSE comment, keeps connection alive
          }
        }, 30000);

        // File watcher for issues.jsonl file(s)
        // In multi-worktree mode, watch all specified files
        const watcher = chokidar.watch(issueFiles, {
          persistent: true,
          ignoreInitial: true,
        });

        watcher.on('change', () => {
          // Broadcast change to all SSE clients with event ID
          eventCounter++;
          const message = JSON.stringify({ type: 'change', timestamp: new Date().toISOString() });
          for (const client of sseClients) {
            client.write(`id: ${eventCounter}\ndata: ${message}\n\n`);
          }
        });

        // Graceful shutdown - clear heartbeat and close file watcher
        const shutdown = () => {
          clearInterval(heartbeatInterval);
          watcher.close();
          process.exit(0);
        };
        process.on('SIGTERM', shutdown);
        process.on('SIGINT', shutdown);

        // POST /api/issues - Create a new issue
        // Multi-worktree: Use ?target=<index> to specify which file to write to
        app.post('/api/issues', (req, res) => {
          try {
            // Determine target file for multi-worktree mode
            let targetFile: string | null = null;
            if (isMultiWorktree() && req.query.target !== undefined) {
              const targetIndex = parseInt(req.query.target as string, 10);
              if (isNaN(targetIndex) || targetIndex < 0 || targetIndex >= issueFiles.length) {
                res.status(400).json({ error: `Invalid target index: ${req.query.target}` });
                return;
              }
              targetFile = issueFiles[targetIndex];
            }

            // Get pebbleDir - for multi-worktree with target, derive from target file path
            const pebbleDir = targetFile ? path.dirname(targetFile) : getOrCreatePebbleDir();
            const config = getConfig(pebbleDir);
            const { title, type, priority, description, parent } = req.body;

            // Validate required fields
            if (!title || typeof title !== 'string') {
              res.status(400).json({ error: 'Title is required' });
              return;
            }

            // Validate type
            const issueType: IssueType = type || 'task';
            if (!ISSUE_TYPES.includes(issueType)) {
              res.status(400).json({ error: `Invalid type. Must be one of: ${ISSUE_TYPES.join(', ')}` });
              return;
            }

            // Validate priority
            const issuePriority: Priority = priority ?? 2;
            if (!PRIORITIES.includes(issuePriority)) {
              res.status(400).json({ error: 'Priority must be 0-4' });
              return;
            }

            // Validate parent if provided
            if (parent) {
              const parentIssue = getIssue(parent);
              if (!parentIssue) {
                res.status(400).json({ error: `Parent issue not found: ${parent}` });
                return;
              }
              if (parentIssue.type !== 'epic') {
                res.status(400).json({ error: 'Parent must be an epic' });
                return;
              }
              if (parentIssue.status === 'closed') {
                res.status(400).json({ error: 'Cannot add children to a closed epic' });
                return;
              }
            }

            const issueId = generateId(config.prefix);
            const timestamp = new Date().toISOString();

            const event: CreateEvent = {
              type: 'create',
              issueId,
              timestamp,
              data: {
                title,
                type: issueType,
                priority: issuePriority,
                description,
                parent,
              },
            };

            appendEvent(event, pebbleDir);
            const issue = getIssue(issueId);
            res.status(201).json(issue);
          } catch (error) {
            res.status(500).json({ error: (error as Error).message });
          }
        });

        // ===== Bulk Operations =====
        // These MUST be defined before parameterized routes like /api/issues/:id

        // POST /api/issues/bulk/close - Close multiple issues
        app.post('/api/issues/bulk/close', (req, res) => {
          try {
            const pebbleDir = getOrCreatePebbleDir();
            const { ids } = req.body as { ids: string[] };

            if (!ids || !Array.isArray(ids) || ids.length === 0) {
              res.status(400).json({ error: 'ids array is required' });
              return;
            }

            const results: Array<{ id: string; success: boolean; error?: string }> = [];

            for (const rawId of ids) {
              try {
                const issueId = resolveId(rawId);
                const issue = getIssue(issueId);
                if (!issue) {
                  results.push({ id: rawId, success: false, error: `Issue not found: ${rawId}` });
                  continue;
                }

                if (issue.status === 'closed') {
                  results.push({ id: issueId, success: true }); // Already closed
                  continue;
                }

                // Check if epic with open children
                if (issue.type === 'epic' && hasOpenChildren(issueId)) {
                  results.push({ id: issueId, success: false, error: 'Cannot close epic with open children' });
                  continue;
                }

                const event: CloseEvent = {
                  issueId,
                  timestamp: new Date().toISOString(),
                  type: 'close',
                  data: { reason: 'Bulk close' },
                };

                appendEvent(event, pebbleDir);
                results.push({ id: issueId, success: true });
              } catch (error) {
                results.push({ id: rawId, success: false, error: (error as Error).message });
              }
            }

            res.json({ results });
          } catch (error) {
            res.status(500).json({ error: (error as Error).message });
          }
        });

        // POST /api/issues/bulk/update - Update multiple issues
        app.post('/api/issues/bulk/update', (req, res) => {
          try {
            const pebbleDir = getOrCreatePebbleDir();
            const { ids, updates } = req.body as {
              ids: string[];
              updates: { status?: string; priority?: number };
            };

            if (!ids || !Array.isArray(ids) || ids.length === 0) {
              res.status(400).json({ error: 'ids array is required' });
              return;
            }

            if (!updates || Object.keys(updates).length === 0) {
              res.status(400).json({ error: 'updates object is required' });
              return;
            }

            // Validate status if provided
            if (updates.status) {
              const validStatuses = ['open', 'in_progress', 'blocked'];
              if (!validStatuses.includes(updates.status)) {
                res.status(400).json({
                  error: `Invalid status: ${updates.status}. Use close endpoint to close issues.`,
                });
                return;
              }
            }

            // Validate priority if provided
            if (updates.priority !== undefined) {
              if (typeof updates.priority !== 'number' || updates.priority < 0 || updates.priority > 4) {
                res.status(400).json({ error: 'Priority must be 0-4' });
                return;
              }
            }

            const results: Array<{ id: string; success: boolean; error?: string }> = [];

            for (const rawId of ids) {
              try {
                const issueId = resolveId(rawId);
                const issue = getIssue(issueId);
                if (!issue) {
                  results.push({ id: rawId, success: false, error: `Issue not found: ${rawId}` });
                  continue;
                }

                const event: UpdateEvent = {
                  issueId,
                  timestamp: new Date().toISOString(),
                  type: 'update',
                  data: {
                    ...(updates.status && { status: updates.status as 'open' | 'in_progress' | 'blocked' }),
                    ...(updates.priority !== undefined && { priority: updates.priority as 0 | 1 | 2 | 3 | 4 }),
                  },
                };

                appendEvent(event, pebbleDir);
                results.push({ id: issueId, success: true });
              } catch (error) {
                results.push({ id: rawId, success: false, error: (error as Error).message });
              }
            }

            res.json({ results });
          } catch (error) {
            res.status(500).json({ error: (error as Error).message });
          }
        });

        // PUT /api/issues/:id - Update an issue
        app.put('/api/issues/:id', (req, res) => {
          try {
            const pebbleDir = getOrCreatePebbleDir();
            const issueId = resolveId(req.params.id);
            const issue = getIssue(issueId);

            if (!issue) {
              res.status(404).json({ error: `Issue not found: ${req.params.id}` });
              return;
            }

            const { title, type, priority, status, description, parent } = req.body;
            const updates: UpdateEvent['data'] = {};

            // Validate and collect updates
            if (title !== undefined) {
              if (typeof title !== 'string' || title.trim() === '') {
                res.status(400).json({ error: 'Title cannot be empty' });
                return;
              }
              updates.title = title;
            }

            if (type !== undefined) {
              if (!ISSUE_TYPES.includes(type)) {
                res.status(400).json({ error: `Invalid type. Must be one of: ${ISSUE_TYPES.join(', ')}` });
                return;
              }
              updates.type = type;
            }

            if (priority !== undefined) {
              if (!PRIORITIES.includes(priority)) {
                res.status(400).json({ error: 'Priority must be 0-4' });
                return;
              }
              updates.priority = priority;
            }

            if (status !== undefined) {
              if (!STATUSES.includes(status)) {
                res.status(400).json({ error: `Invalid status. Must be one of: ${STATUSES.join(', ')}` });
                return;
              }
              updates.status = status;
            }

            if (description !== undefined) {
              updates.description = description;
            }

            if (parent !== undefined) {
              if (parent !== null) {
                const parentIssue = getIssue(parent);
                if (!parentIssue) {
                  res.status(400).json({ error: `Parent issue not found: ${parent}` });
                  return;
                }
                if (parentIssue.type !== 'epic') {
                  res.status(400).json({ error: 'Parent must be an epic' });
                  return;
                }
              }
              updates.parent = parent;
            }

            if (Object.keys(updates).length === 0) {
              res.status(400).json({ error: 'No valid updates provided' });
              return;
            }

            const timestamp = new Date().toISOString();
            const event: UpdateEvent = {
              type: 'update',
              issueId,
              timestamp,
              data: updates,
            };

            appendEvent(event, pebbleDir);
            const updatedIssue = getIssue(issueId);
            res.json(updatedIssue);
          } catch (error) {
            res.status(500).json({ error: (error as Error).message });
          }
        });

        // POST /api/issues/:id/close - Close an issue
        app.post('/api/issues/:id/close', (req, res) => {
          try {
            const pebbleDir = getOrCreatePebbleDir();
            const issueId = resolveId(req.params.id);
            const issue = getIssue(issueId);

            if (!issue) {
              res.status(404).json({ error: `Issue not found: ${req.params.id}` });
              return;
            }

            if (issue.status === 'closed') {
              res.status(400).json({ error: 'Issue is already closed' });
              return;
            }

            // Check if epic has open children
            if (issue.type === 'epic' && hasOpenChildren(issueId)) {
              res.status(400).json({ error: 'Cannot close epic with open children' });
              return;
            }

            const { reason } = req.body;
            const timestamp = new Date().toISOString();

            const event: CloseEvent = {
              type: 'close',
              issueId,
              timestamp,
              data: { reason },
            };

            appendEvent(event, pebbleDir);
            const closedIssue = getIssue(issueId);
            res.json(closedIssue);
          } catch (error) {
            res.status(500).json({ error: (error as Error).message });
          }
        });

        // POST /api/issues/:id/reopen - Reopen an issue
        app.post('/api/issues/:id/reopen', (req, res) => {
          try {
            const pebbleDir = getOrCreatePebbleDir();
            const issueId = resolveId(req.params.id);
            const issue = getIssue(issueId);

            if (!issue) {
              res.status(404).json({ error: `Issue not found: ${req.params.id}` });
              return;
            }

            if (issue.status !== 'closed') {
              res.status(400).json({ error: 'Issue is not closed' });
              return;
            }

            const { reason } = req.body;
            const timestamp = new Date().toISOString();

            const event: ReopenEvent = {
              type: 'reopen',
              issueId,
              timestamp,
              data: { reason },
            };

            appendEvent(event, pebbleDir);
            const reopenedIssue = getIssue(issueId);
            res.json(reopenedIssue);
          } catch (error) {
            res.status(500).json({ error: (error as Error).message });
          }
        });

        // POST /api/issues/:id/comments - Add a comment
        app.post('/api/issues/:id/comments', (req, res) => {
          try {
            const pebbleDir = getOrCreatePebbleDir();
            const issueId = resolveId(req.params.id);
            const issue = getIssue(issueId);

            if (!issue) {
              res.status(404).json({ error: `Issue not found: ${req.params.id}` });
              return;
            }

            const { text, author } = req.body;

            if (!text || typeof text !== 'string' || text.trim() === '') {
              res.status(400).json({ error: 'Comment text is required' });
              return;
            }

            const timestamp = new Date().toISOString();

            const event: CommentEvent = {
              type: 'comment',
              issueId,
              timestamp,
              data: {
                text,
                timestamp,
                author,
              },
            };

            appendEvent(event, pebbleDir);
            const updatedIssue = getIssue(issueId);
            res.json(updatedIssue);
          } catch (error) {
            res.status(500).json({ error: (error as Error).message });
          }
        });

        // POST /api/issues/:id/deps - Add a dependency
        app.post('/api/issues/:id/deps', (req, res) => {
          try {
            const pebbleDir = getOrCreatePebbleDir();
            const issueId = resolveId(req.params.id);
            const issue = getIssue(issueId);

            if (!issue) {
              res.status(404).json({ error: `Issue not found: ${req.params.id}` });
              return;
            }

            const { blockerId } = req.body;

            if (!blockerId) {
              res.status(400).json({ error: 'blockerId is required' });
              return;
            }

            const resolvedBlockerId = resolveId(blockerId);
            const blockerIssue = getIssue(resolvedBlockerId);

            if (!blockerIssue) {
              res.status(404).json({ error: `Blocker issue not found: ${blockerId}` });
              return;
            }

            // Check if already a dependency
            if (issue.blockedBy.includes(resolvedBlockerId)) {
              res.status(400).json({ error: 'Dependency already exists' });
              return;
            }

            // Check for cycles
            if (detectCycle(issueId, resolvedBlockerId)) {
              res.status(400).json({ error: 'Adding this dependency would create a cycle' });
              return;
            }

            const timestamp = new Date().toISOString();
            const event: UpdateEvent = {
              type: 'update',
              issueId,
              timestamp,
              data: {
                blockedBy: [...issue.blockedBy, resolvedBlockerId],
              },
            };

            appendEvent(event, pebbleDir);
            const updatedIssue = getIssue(issueId);
            res.json(updatedIssue);
          } catch (error) {
            res.status(500).json({ error: (error as Error).message });
          }
        });

        // DELETE /api/issues/:id/deps/:blockerId - Remove a dependency
        app.delete('/api/issues/:id/deps/:blockerId', (req, res) => {
          try {
            const pebbleDir = getOrCreatePebbleDir();
            const issueId = resolveId(req.params.id);
            const issue = getIssue(issueId);

            if (!issue) {
              res.status(404).json({ error: `Issue not found: ${req.params.id}` });
              return;
            }

            const resolvedBlockerId = resolveId(req.params.blockerId);

            if (!issue.blockedBy.includes(resolvedBlockerId)) {
              res.status(400).json({ error: 'Dependency does not exist' });
              return;
            }

            const timestamp = new Date().toISOString();
            const event: UpdateEvent = {
              type: 'update',
              issueId,
              timestamp,
              data: {
                blockedBy: issue.blockedBy.filter((id) => id !== resolvedBlockerId),
              },
            };

            appendEvent(event, pebbleDir);
            const updatedIssue = getIssue(issueId);
            res.json(updatedIssue);
          } catch (error) {
            res.status(500).json({ error: (error as Error).message });
          }
        });

        // Serve static files from the bundled UI
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const uiPath = path.resolve(__dirname, '../ui');

        app.use(express.static(uiPath));

        // SPA fallback
        app.get('*', (_req, res) => {
          res.sendFile(path.join(uiPath, 'index.html'));
        });

        // Start server with port fallback
        const requestedPort = parseInt(options.port, 10);
        const actualPort = await findAvailablePort(requestedPort);

        if (actualPort !== requestedPort) {
          console.log(`Port ${requestedPort} is busy, using ${actualPort} instead`);
        }

        app.listen(actualPort, () => {
          const url = `http://localhost:${actualPort}`;
          console.log(`Pebble UI running at ${url}`);

          if (options.open !== false) {
            open(url);
          }
        });
      } catch (error) {
        outputError(error as Error, pretty);
        process.exit(1);
      }
    });
}
