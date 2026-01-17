// Issue types
export const ISSUE_TYPES = ['task', 'bug', 'epic', 'verification'] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];

// Priority levels (0 = critical, 4 = backlog)
export const PRIORITIES = [0, 1, 2, 3, 4] as const;
export type Priority = (typeof PRIORITIES)[number];

// Status values
export const STATUSES = ['open', 'in_progress', 'blocked', 'pending_verification', 'closed'] as const;
export type Status = (typeof STATUSES)[number];

// Comment interface
export interface Comment {
  text: string;
  timestamp: string; // ISO timestamp
  author?: string;
}

// Issue interface - the current state of an issue
export interface Issue {
  id: string; // PREFIX-xxxxxx (6 char alphanumeric suffix)
  title: string;
  type: IssueType;
  priority: Priority;
  status: Status;
  description?: string;
  parent?: string; // ID of parent epic
  blockedBy: string[]; // IDs of blocking issues
  relatedTo: string[]; // IDs of related issues (bidirectional, non-blocking)
  verifies?: string; // ID of issue this verifies (only for type: verification)
  comments: Comment[];
  createdAt: string; // ISO timestamp
  updatedAt: string; // ISO timestamp
  _sources?: string[]; // File paths where this issue exists (multi-worktree)
}

// Event types for append-only JSONL
export const EVENT_TYPES = ['create', 'update', 'close', 'reopen', 'comment'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

// Base event interface
interface BaseEvent {
  type: EventType;
  issueId: string;
  timestamp: string; // ISO timestamp
}

// Create event - includes all initial issue data
export interface CreateEvent extends BaseEvent {
  type: 'create';
  data: {
    title: string;
    type: IssueType;
    priority: Priority;
    description?: string;
    parent?: string;
    verifies?: string; // ID of issue this verifies (only for type: verification)
  };
}

// Update event - partial issue update
export interface UpdateEvent extends BaseEvent {
  type: 'update';
  data: {
    title?: string;
    type?: IssueType;
    priority?: Priority;
    status?: Status;
    description?: string;
    parent?: string;
    blockedBy?: string[];
    relatedTo?: string[];
  };
}

// Close event
export interface CloseEvent extends BaseEvent {
  type: 'close';
  data: {
    reason?: string;
  };
}

// Reopen event
export interface ReopenEvent extends BaseEvent {
  type: 'reopen';
  data: {
    reason?: string;
  };
}

// Comment event
export interface CommentEvent extends BaseEvent {
  type: 'comment';
  data: Comment;
}

// Union type for all events
export type IssueEvent =
  | CreateEvent
  | UpdateEvent
  | CloseEvent
  | ReopenEvent
  | CommentEvent;

// Config stored in .pebble/config.json
export interface PebbleConfig {
  prefix: string;
  version: string;
}

// Helper type for issue filters
export interface IssueFilters {
  status?: Status;
  type?: IssueType;
  priority?: Priority;
  parent?: string;
}

// Priority labels for display
export const PRIORITY_LABELS: Record<Priority, string> = {
  0: 'critical',
  1: 'high',
  2: 'medium',
  3: 'low',
  4: 'backlog',
};

// Status labels for display
export const STATUS_LABELS: Record<Status, string> = {
  open: 'Open',
  in_progress: 'In Progress',
  blocked: 'Blocked',
  pending_verification: 'Pending Verification',
  closed: 'Closed',
};

// Type labels for display
export const TYPE_LABELS: Record<IssueType, string> = {
  task: 'Task',
  bug: 'Bug',
  epic: 'Epic',
  verification: 'Verification',
};

// Badge variant types (for shadcn/ui Badge component)
export type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'outline';

// Status badge variants for UI
export const STATUS_BADGE_VARIANTS: Record<Status, BadgeVariant> = {
  open: 'outline',
  in_progress: 'default',
  blocked: 'destructive',
  pending_verification: 'default', // Uses warning color via className
  closed: 'secondary',
};

// Type badge variants for UI
export const TYPE_BADGE_VARIANTS: Record<IssueType, BadgeVariant> = {
  task: 'default',
  bug: 'destructive',
  epic: 'secondary',
  verification: 'outline',
};

// Priority labels for UI display (capitalized)
export const PRIORITY_DISPLAY_LABELS: Record<Priority, string> = {
  0: 'Critical',
  1: 'High',
  2: 'Medium',
  3: 'Low',
  4: 'Backlog',
};
