# pebble

A lightweight, JSONL-based issue tracker with CLI and React UI.

## Features

- **Simple storage**: Append-only JSONL file enables full history
- **Git-like discovery**: Auto-discovers `.pebble/` directory upward
- **JSON-first output**: JSON by default, `--pretty` for human-readable
- **Dependencies**: Block issues on other issues, cycle detection
- **React UI**: View issues, filter, sort, dependency graph visualization

## Installation

```bash
npm install -g @markmdev/pebble
```

After installation, the `pb` command is available globally.

## Quick Start

```bash
# Create your first issue (auto-initializes .pebble/ directory)
pb create "Fix login bug" -t bug -p 1

# List all issues
pb list

# Show ready issues (no open blockers)
pb ready

# View in the browser
pb ui
```

## Commands

### Queries

| Command | Description |
|---------|-------------|
| `pb ready` | Issues with no open blockers |
| `pb blocked` | Issues with open blockers |
| `pb list [options]` | List issues with filters |
| `pb show <id>` | Full issue details |

### Mutations

| Command | Description |
|---------|-------------|
| `pb create <title> [options]` | Create an issue |
| `pb update <ids...> [options]` | Update issues (supports batch) |
| `pb claim <ids...>` | Set status to in_progress (shorthand) |
| `pb close <ids...> [--reason] [--comment]` | Close issues (supports batch) |
| `pb reopen <id> [--reason]` | Reopen an issue |

### Dependencies

| Command | Description |
|---------|-------------|
| `pb dep add <id> <blocker>` | Add blocking dependency |
| `pb dep remove <id> <blocker>` | Remove dependency |
| `pb dep list <id>` | Show dependencies |
| `pb dep tree <id>` | Show dependency tree |

### Comments & Visualization

| Command | Description |
|---------|-------------|
| `pb comments add <id> <text>` | Add a comment |
| `pb graph [--root id]` | Show dependency graph |
| `pb ui [--port 3333]` | Serve React UI |

## Options

### Global

- `--pretty` — Human-readable output (default: JSON)
- `--help` — Show help

### Create

- `-t, --type <type>` — Issue type: task, bug, epic (default: task)
- `-p, --priority <n>` — Priority: 0=critical, 4=backlog (default: 2)
- `-d, --description <text>` — Description
- `--parent <id>` — Parent epic ID

### List

- `--status <status>` — Filter by status
- `--type <type>` — Filter by type
- `--priority <n>` — Filter by priority
- `--parent <id>` — Filter by parent

### Update

- `--status <status>` — Set status
- `--priority <n>` — Set priority
- `--title <text>` — Set title
- `--description <text>` — Set description

## Data Model

### Issue

```typescript
{
  id: string;           // PREFIX-xxxxxx
  title: string;
  type: 'task' | 'bug' | 'epic';
  priority: 0-4;        // 0=critical, 4=backlog
  status: 'open' | 'in_progress' | 'blocked' | 'closed';
  description?: string;
  parent?: string;      // Parent epic ID
  blockedBy: string[];  // IDs of blocking issues
  comments: Comment[];
  createdAt: string;
  updatedAt: string;
}
```

### Storage

All data is stored in `.pebble/issues.jsonl` as append-only events:
- `create` — New issue
- `update` — Field changes
- `close` — Close with reason
- `reopen` — Reopen with reason
- `comment` — Add comment

## UI Features

The React UI (`pb ui`) provides full CRUD capabilities with real-time updates:

- **Issue List**: Hierarchical view (epics with children), sorting, filtering, search
- **Create Issues**: "New Issue" button opens creation dialog
- **Inline Editing**: Click title to edit, status/priority dropdowns, description editing
- **Issue Actions**: Close/reopen, add comments, manage blockers
- **Dependency Graph**: Interactive visualization with parent-child and blocker edges
- **History View**: Timeline of all events, filterable by type
- **Real-time Sync**: Changes from CLI automatically appear in UI via SSE
- **Breadcrumbs**: Navigation trail for easy orientation

## Business Rules

1. **Ready**: Non-closed issue where all `blockedBy` issues are closed
2. **Blocked**: Issue has at least one open blocker
3. **Epic close**: Cannot close epic if any child is not closed
4. **Cycle detection**: Cannot create circular dependencies
5. **ID resolution**: Partial IDs work (case-insensitive prefix match)

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test

# Type check
npm run typecheck
```

## License

MIT
