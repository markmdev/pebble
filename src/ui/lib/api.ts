import type { Issue, IssueEvent, IssueType, Priority, Status } from '../../shared/types';

const API_BASE = '/api';

// Helper for handling API responses
async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `Request failed: ${response.statusText}`);
  }
  return response.json();
}

// Source info for multi-worktree mode
export interface SourcesResponse {
  files: string[];
  isMultiWorktree: boolean;
}

// GET endpoints
export async function fetchSources(): Promise<SourcesResponse> {
  const response = await fetch(`${API_BASE}/sources`);
  return handleResponse<SourcesResponse>(response);
}

export async function addSource(filePath: string): Promise<SourcesResponse> {
  const response = await fetch(`${API_BASE}/sources`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path: filePath }),
  });
  return handleResponse<SourcesResponse>(response);
}

export async function removeSource(index: number): Promise<SourcesResponse> {
  const response = await fetch(`${API_BASE}/sources/${index}`, {
    method: 'DELETE',
  });
  return handleResponse<SourcesResponse>(response);
}

// Worktree detection
export interface Worktree {
  path: string;
  branch: string | null;
  issuesFile: string | null;
  hasIssues: boolean;
  isActive: boolean;
  issueCount: number;
}

export async function fetchWorktrees(): Promise<{ worktrees: Worktree[] }> {
  const response = await fetch(`${API_BASE}/worktrees`);
  return handleResponse<{ worktrees: Worktree[] }>(response);
}

export async function fetchIssues(): Promise<Issue[]> {
  const response = await fetch(`${API_BASE}/issues`);
  return handleResponse<Issue[]>(response);
}

export async function fetchEvents(): Promise<IssueEvent[]> {
  const response = await fetch(`${API_BASE}/events`);
  return handleResponse<IssueEvent[]>(response);
}

// Mutation types
export interface CreateIssueInput {
  title: string;
  type?: IssueType;
  priority?: Priority;
  description?: string;
  parent?: string;
}

export interface UpdateIssueInput {
  title?: string;
  type?: IssueType;
  priority?: Priority;
  status?: Status;
  description?: string;
  parent?: string | null;
  relatedTo?: string[];
}

// Mutation endpoints
export async function createIssue(data: CreateIssueInput, targetSourceIndex?: number): Promise<Issue> {
  const url = targetSourceIndex !== undefined
    ? `${API_BASE}/issues?target=${targetSourceIndex}`
    : `${API_BASE}/issues`;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<Issue>(response);
}

export async function updateIssue(id: string, data: UpdateIssueInput): Promise<Issue> {
  const response = await fetch(`${API_BASE}/issues/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return handleResponse<Issue>(response);
}

export async function closeIssue(id: string, reason?: string): Promise<Issue> {
  const response = await fetch(`${API_BASE}/issues/${encodeURIComponent(id)}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  return handleResponse<Issue>(response);
}

export async function reopenIssue(id: string, reason?: string): Promise<Issue> {
  const response = await fetch(`${API_BASE}/issues/${encodeURIComponent(id)}/reopen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  });
  return handleResponse<Issue>(response);
}

export async function addComment(id: string, text: string, author?: string): Promise<Issue> {
  const response = await fetch(`${API_BASE}/issues/${encodeURIComponent(id)}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, author }),
  });
  return handleResponse<Issue>(response);
}

export async function addDependency(id: string, blockerId: string): Promise<Issue> {
  const response = await fetch(`${API_BASE}/issues/${encodeURIComponent(id)}/deps`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ blockerId }),
  });
  return handleResponse<Issue>(response);
}

export async function removeDependency(id: string, blockerId: string): Promise<Issue> {
  const response = await fetch(
    `${API_BASE}/issues/${encodeURIComponent(id)}/deps/${encodeURIComponent(blockerId)}`,
    { method: 'DELETE' }
  );
  return handleResponse<Issue>(response);
}

// Related issues (bidirectional, non-blocking relationships)
export async function addRelated(
  issueId: string,
  relatedId: string,
  currentRelatedTo: string[],
  relatedIssueRelatedTo: string[]
): Promise<void> {
  // Add relatedId to issueId's relatedTo
  const newRelatedTo1 = [...currentRelatedTo, relatedId];
  await updateIssue(issueId, { relatedTo: newRelatedTo1 });

  // Add issueId to relatedId's relatedTo (bidirectional)
  const newRelatedTo2 = [...relatedIssueRelatedTo, issueId];
  await updateIssue(relatedId, { relatedTo: newRelatedTo2 });
}

export async function removeRelated(
  issueId: string,
  relatedId: string,
  currentRelatedTo: string[],
  relatedIssueRelatedTo: string[]
): Promise<void> {
  // Remove relatedId from issueId's relatedTo
  const newRelatedTo1 = currentRelatedTo.filter(id => id !== relatedId);
  await updateIssue(issueId, { relatedTo: newRelatedTo1 });

  // Remove issueId from relatedId's relatedTo (bidirectional)
  const newRelatedTo2 = relatedIssueRelatedTo.filter(id => id !== issueId);
  await updateIssue(relatedId, { relatedTo: newRelatedTo2 });
}

// Bulk operation types
export interface BulkResult {
  results: Array<{ id: string; success: boolean; error?: string }>;
}

// Bulk operations
export async function bulkCloseIssues(ids: string[]): Promise<BulkResult> {
  const response = await fetch(`${API_BASE}/issues/bulk/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });
  return handleResponse<BulkResult>(response);
}

export async function bulkUpdateIssues(
  ids: string[],
  updates: { status?: Status; priority?: Priority }
): Promise<BulkResult> {
  const response = await fetch(`${API_BASE}/issues/bulk/update`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, updates }),
  });
  return handleResponse<BulkResult>(response);
}
