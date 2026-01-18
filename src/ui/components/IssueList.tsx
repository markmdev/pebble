import React, { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getExpandedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
  type ColumnFiltersState,
  type ExpandedState,
} from '@tanstack/react-table';
import type { Issue, IssueEvent } from '../../shared/types';
import {
  STATUS_BADGE_VARIANTS,
  TYPE_BADGE_VARIANTS,
  PRIORITY_DISPLAY_LABELS,
} from '../../shared/types';
import { formatRelativeTime } from '../../shared/time';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from './ui/table';
import { Badge } from './ui/badge';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Button } from './ui/button';
import { ArrowUpDown, ChevronRight, ChevronDown, FolderSync, Folder, FolderOpen, Search, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { getCommonPrefix, getRelativePath } from '../lib/path';

export type FilterPreset = 'ready' | 'blocked' | 'in_progress' | 'all_open' | 'verifications' | null;
import { getStatusOrder } from '../lib/sort';

export interface IssueListProps {
  issues: Issue[];
  events: IssueEvent[];
  onSelectIssue: (issue: Issue) => void;
  selectedIds?: Set<string>;
  onToggleSelect?: (issueId: string) => void;
  onSelectAll?: (issueIds: string[]) => void;
  onClearSelection?: () => void;
  // Lifted state props (optional - falls back to internal state)
  // Uses React dispatch pattern: (value | (prev => value)) => void
  sorting?: SortingState;
  onSortingChange?: React.Dispatch<React.SetStateAction<SortingState>>;
  columnFilters?: ColumnFiltersState;
  onColumnFiltersChange?: React.Dispatch<React.SetStateAction<ColumnFiltersState>>;
  globalFilter?: string;
  onGlobalFilterChange?: React.Dispatch<React.SetStateAction<string>>;
  expanded?: ExpandedState;
  onExpandedChange?: React.Dispatch<React.SetStateAction<ExpandedState>>;
  activePreset?: FilterPreset;
  onActivePresetChange?: React.Dispatch<React.SetStateAction<FilterPreset>>;
  sourceFilter?: string;
  onSourceFilterChange?: React.Dispatch<React.SetStateAction<string>>;
}

// Extended issue type with subRows for TanStack hierarchy
interface IssueWithChildren extends Issue {
  subRows?: IssueWithChildren[];
  _isGroup?: boolean; // Synthetic group row (e.g., "No parent")
}

// Helper to check if issue has open (unresolved) blockers
function hasOpenBlockers(issue: Issue, issueMap: Map<string, Issue>): boolean {
  return issue.blockedBy.some((blockerId) => {
    const blocker = issueMap.get(blockerId);
    return blocker && blocker.status !== 'closed';
  });
}

// Helper to count open blockers
function countOpenBlockers(issue: Issue, issueMap: Map<string, Issue>): number {
  return issue.blockedBy.filter((blockerId) => {
    const blocker = issueMap.get(blockerId);
    return blocker && blocker.status !== 'closed';
  }).length;
}

// Build hierarchical data: supports unlimited nesting depth
// Also nests verification issues under their target issues
function buildHierarchy(issues: Issue[]): IssueWithChildren[] {
  const issueMap = new Map(issues.map((i) => [i.id, i]));
  const childrenByParent = new Map<string, Issue[]>();
  const verificationsByTarget = new Map<string, Issue[]>();

  // Group children by parent and verifications by target
  for (const issue of issues) {
    if (issue.parent && issueMap.has(issue.parent)) {
      const children = childrenByParent.get(issue.parent) || [];
      children.push(issue);
      childrenByParent.set(issue.parent, children);
    }
    // Group verification issues by their target (separate from parent-child)
    if (issue.type === 'verification' && issue.verifies && issueMap.has(issue.verifies)) {
      const verifications = verificationsByTarget.get(issue.verifies) || [];
      verifications.push(issue);
      verificationsByTarget.set(issue.verifies, verifications);
    }
  }

  // Recursively build hierarchy for an issue
  function buildIssueWithChildren(issue: Issue): IssueWithChildren {
    const children = childrenByParent.get(issue.id) || [];
    const verifications = verificationsByTarget.get(issue.id) || [];

    // Sort children: open issues first (by status), closed at bottom
    const sortedChildren = [...children].sort((a, b) => {
      return getStatusOrder(a.status) - getStatusOrder(b.status);
    });

    // Sort verifications: open first, then by status
    const sortedVerifications = [...verifications].sort((a, b) => {
      return getStatusOrder(a.status) - getStatusOrder(b.status);
    });

    // Recursively build children's children (but NOT verifications - they don't nest further)
    const childSubRows = sortedChildren.map(child => buildIssueWithChildren(child));
    // Verifications are leaf nodes (no further nesting)
    const verificationSubRows = sortedVerifications.map(v => ({ ...v, subRows: undefined }));

    // Combine: children first, then verifications
    const allSubRows = [...childSubRows, ...verificationSubRows];
    const subRows = allSubRows.length > 0 ? allSubRows : undefined;

    return {
      ...issue,
      subRows,
    };
  }

  // Build top level (issues without parents or with missing parents)
  // Also exclude verification issues that have a valid target (they're nested under it)
  const epicsAndParents: IssueWithChildren[] = [];
  const orphans: IssueWithChildren[] = [];

  for (const issue of issues) {
    // Skip if this issue has a valid parent (it will be nested under parent)
    if (issue.parent && issueMap.has(issue.parent)) {
      continue;
    }
    // Skip verification issues that have a valid target (they're nested under target)
    if (issue.type === 'verification' && issue.verifies && issueMap.has(issue.verifies)) {
      continue;
    }

    const builtIssue = buildIssueWithChildren(issue);

    // Epics and issues with children go to top level
    // Orphans (non-epic, no children) go to "No parent" group
    if (issue.type === 'epic' || (builtIssue.subRows?.length ?? 0) > 0) {
      epicsAndParents.push(builtIssue);
    } else {
      orphans.push(builtIssue);
    }
  }

  // Sort epics: by status
  epicsAndParents.sort((a, b) => {
    return getStatusOrder(a.status) - getStatusOrder(b.status);
  });

  // Sort orphans: by status
  orphans.sort((a, b) => {
    return getStatusOrder(a.status) - getStatusOrder(b.status);
  });

  // Create "No parent" synthetic group if there are orphans
  if (orphans.length > 0) {
    const noParentGroup: IssueWithChildren = {
      id: '__NO_PARENT__',
      title: 'No parent',
      type: 'epic', // Use epic type for expandable styling
      priority: 4,
      status: 'open',
      description: '',
      blockedBy: [],
      relatedTo: [],
      comments: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      subRows: orphans,
      _isGroup: true,
    };
    // Put epics first, then the "No parent" group at the end
    return [...epicsAndParents, noParentGroup];
  }

  return epicsAndParents;
}

// Get description of what changed in an event
function getEventDescription(event: IssueEvent): string {
  switch (event.type) {
    case 'create':
      return 'created';
    case 'close':
      return 'closed';
    case 'reopen':
      return 'reopened';
    case 'comment':
      return 'commented';
    case 'update': {
      const data = event.data as Record<string, unknown>;
      const keys = Object.keys(data);
      if (keys.length === 1) {
        return `${keys[0]} changed`;
      }
      return `${keys.length} fields changed`;
    }
    default:
      return 'updated';
  }
}

export function IssueList({
  issues,
  events,
  onSelectIssue,
  selectedIds = new Set(),
  onToggleSelect,
  onSelectAll,
  onClearSelection: _onClearSelection,
  // Lifted state props with fallback to internal state
  sorting: sortingProp,
  onSortingChange,
  columnFilters: columnFiltersProp,
  onColumnFiltersChange,
  globalFilter: globalFilterProp,
  onGlobalFilterChange,
  expanded: expandedProp,
  onExpandedChange,
  activePreset: activePresetProp,
  onActivePresetChange,
  sourceFilter: sourceFilterProp,
  onSourceFilterChange,
}: IssueListProps) {
  // Unused for now, will be used by BulkActionBar
  void _onClearSelection;

  // Internal state (used when props not provided)
  const [sortingInternal, setSortingInternal] = useState<SortingState>([
    { id: 'status', desc: false }, // Status first: in_progress → open → blocked → closed
    { id: 'updatedAt', desc: true } // Then by updatedAt: newest first
  ]);
  const [columnFiltersInternal, setColumnFiltersInternal] = useState<ColumnFiltersState>([]);
  const [globalFilterInternal, setGlobalFilterInternal] = useState('');
  const [expandedInternal, setExpandedInternal] = useState<ExpandedState>({}); // Start collapsed
  const [activePresetInternal, setActivePresetInternal] = useState<FilterPreset>(null);
  const [sourceFilterInternal, setSourceFilterInternal] = useState<string>('');

  // Use props if provided, otherwise use internal state
  const sorting = sortingProp ?? sortingInternal;
  const setSorting = onSortingChange ?? setSortingInternal;
  const columnFilters = columnFiltersProp ?? columnFiltersInternal;
  const setColumnFilters = onColumnFiltersChange ?? setColumnFiltersInternal;
  const globalFilter = globalFilterProp ?? globalFilterInternal;
  const setGlobalFilter = onGlobalFilterChange ?? setGlobalFilterInternal;
  const expanded = expandedProp ?? expandedInternal;
  const setExpanded = onExpandedChange ?? setExpandedInternal;
  const activePreset = activePresetProp ?? activePresetInternal;
  const setActivePreset = onActivePresetChange ?? setActivePresetInternal;
  const sourceFilter = sourceFilterProp ?? sourceFilterInternal;
  const setSourceFilter = onSourceFilterChange ?? setSourceFilterInternal;

  // Create lookup map for O(1) issue access
  const issueMap = useMemo(
    () => new Map(issues.map((i) => [i.id, i])),
    [issues]
  );

  // Get latest event for each issue
  const latestEventMap = useMemo(() => {
    const map = new Map<string, IssueEvent>();
    // Events are sorted oldest first, so iterate forward to get latest
    for (const event of events) {
      map.set(event.issueId, event);
    }
    return map;
  }, [events]);

  // Compute common prefix for all source paths (for trimming display)
  const sourcePathPrefix = useMemo(() => {
    const allSources: string[] = [];
    for (const issue of issues) {
      if (issue._sources) {
        allSources.push(...issue._sources);
      }
    }
    return getCommonPrefix(allSources);
  }, [issues]);

  // Compute unique source paths for filter dropdown
  const uniqueSources = useMemo(() => {
    const sources = new Set<string>();
    for (const issue of issues) {
      if (issue._sources) {
        for (const src of issue._sources) {
          sources.add(src);
        }
      }
    }
    return Array.from(sources).sort();
  }, [issues]);

  // Helper: check if issue matches search text
  const matchesSearch = (issue: Issue, search: string): boolean => {
    if (!search) return false;
    const lowerSearch = search.toLowerCase();
    if (issue.title.toLowerCase().includes(lowerSearch)) return true;
    if (issue.id.toLowerCase().includes(lowerSearch)) return true;
    if (issue.type.toLowerCase().includes(lowerSearch)) return true;
    if (issue.status.toLowerCase().includes(lowerSearch)) return true;
    if (issue.description?.toLowerCase().includes(lowerSearch)) return true;
    if (issue.comments.some(c => c.text.toLowerCase().includes(lowerSearch))) return true;
    return false;
  };

  // Compute search-matched IDs and their ancestors (so children show under parents)
  const { searchMatchedIds, ancestorIds } = useMemo(() => {
    const searchMatchedIds = new Set<string>();
    const ancestorIds = new Set<string>();

    if (!globalFilter) {
      return { searchMatchedIds, ancestorIds };
    }

    // Find all issues that match the search
    for (const issue of issues) {
      if (matchesSearch(issue, globalFilter)) {
        searchMatchedIds.add(issue.id);

        // Walk up the parent chain to include ancestors
        let current = issue;
        while (current.parent) {
          ancestorIds.add(current.parent);
          const parent = issueMap.get(current.parent);
          if (!parent) break;
          current = parent;
        }
      }
    }

    return { searchMatchedIds, ancestorIds };
  }, [issues, globalFilter, issueMap]);

  // Apply source and preset filtering BEFORE hierarchy (fixes preset reactivity)
  const filteredIssues = useMemo(() => {
    let result = issues;

    // Apply source filter first
    if (sourceFilter) {
      result = result.filter((issue) =>
        issue._sources?.includes(sourceFilter)
      );
    }

    // Then apply preset filter
    if (!activePreset) return result;

    return result.filter((issue) => {
      // If search is active: include search matches and their ancestors
      // This allows children to appear under their parent epics even when preset filters would exclude them
      if (globalFilter && (searchMatchedIds.has(issue.id) || ancestorIds.has(issue.id))) {
        return true;
      }

      const hasBlockers = hasOpenBlockers(issue, issueMap);
      switch (activePreset) {
        case 'ready': {
          if (issue.status === 'closed') return false;
          if (hasBlockers) return false;
          // For verification issues, target must be closed
          if (issue.type === 'verification' && issue.verifies) {
            const target = issueMap.get(issue.verifies);
            if (!target || target.status !== 'closed') return false;
          }
          return true;
        }
        case 'blocked':
          return hasBlockers;
        case 'in_progress':
          return issue.status === 'in_progress';
        case 'all_open':
          return issue.status !== 'closed';
        case 'verifications':
          return issue.type === 'verification';
        default:
          return true;
      }
    });
  }, [issues, activePreset, issueMap, sourceFilter, globalFilter, searchMatchedIds, ancestorIds]);

  // Build hierarchical data structure from filtered issues
  const hierarchicalData = useMemo(
    () => buildHierarchy(filteredIssues),
    [filteredIssues]
  );

  // Get all visible issue IDs for "select all" functionality
  const visibleIssueIds = useMemo(() => issues.map((i) => i.id), [issues]);

  // Check if all visible issues are selected
  const allSelected = visibleIssueIds.length > 0 && visibleIssueIds.every((id) => selectedIds.has(id));
  const someSelected = visibleIssueIds.some((id) => selectedIds.has(id));

  const columns = useMemo<ColumnDef<IssueWithChildren>[]>(
    () => [
      // Checkbox column for bulk selection
      {
        id: 'select',
        header: () => (
          <input
            type="checkbox"
            checked={allSelected}
            ref={(el) => {
              if (el) el.indeterminate = someSelected && !allSelected;
            }}
            onChange={(e) => {
              e.stopPropagation();
              if (e.target.checked) {
                onSelectAll?.(visibleIssueIds);
              } else {
                onSelectAll?.([]);
              }
            }}
            className="h-4 w-4 rounded border-gray-300 cursor-pointer"
            title="Select all issues"
          />
        ),
        cell: ({ row }) => {
          // Don't show checkbox for synthetic group rows
          if (row.original._isGroup) {
            return null;
          }
          return (
            <input
              type="checkbox"
              checked={selectedIds.has(row.original.id)}
              onChange={(e) => {
                e.stopPropagation();
                onToggleSelect?.(row.original.id);
              }}
              onClick={(e) => e.stopPropagation()}
              className="h-4 w-4 rounded border-gray-300 cursor-pointer"
            />
          );
        },
        enableSorting: false,
        enableColumnFilter: false,
      },
      {
        accessorKey: 'id',
        header: ({ column }) => (
          <button
            className="flex items-center gap-1"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            ID
            <ArrowUpDown className="h-4 w-4" />
          </button>
        ),
        cell: ({ row }) => {
          const canExpand = row.getCanExpand();
          const depth = row.depth;
          const isGroup = row.original._isGroup;
          const sources = row.original._sources;
          const relativePath = sources?.[0] ? getRelativePath(sources[0], sourcePathPrefix) : null;

          // Special rendering for synthetic group rows
          if (isGroup) {
            return (
              <div className="flex items-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    row.toggleExpanded();
                  }}
                  className="p-0.5 hover:bg-muted rounded mr-1"
                >
                  {row.getIsExpanded() ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </button>
                <FolderOpen className="h-4 w-4 mr-1.5 text-muted-foreground" />
                <span className="text-sm font-medium text-muted-foreground">{row.original.title}</span>
                <span className="ml-2 text-xs text-muted-foreground">({row.original.subRows?.length ?? 0})</span>
              </div>
            );
          }

          return (
            <div style={{ paddingLeft: `${depth * 24}px` }}>
              {/* ID row */}
              <div className="flex items-center">
                {canExpand ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      row.toggleExpanded();
                    }}
                    className="p-0.5 hover:bg-muted rounded mr-1"
                  >
                    {row.getIsExpanded() ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </button>
                ) : depth > 0 ? (
                  <span className="w-5 mr-1 border-l-2 border-b-2 border-muted h-3 rounded-bl" />
                ) : (
                  <span className="w-5 mr-1" />
                )}
                <span className="font-mono text-xs">{row.getValue('id')}</span>
              </div>
              {/* Source path row */}
              {relativePath && sources && (
                <div
                  className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5"
                  style={{ paddingLeft: '20px' }}
                  title={sources[0]}
                >
                  {sources.length > 1 ? (
                    <>
                      <FolderSync className="h-3 w-3 flex-shrink-0" />
                      <span>{sources.length} sources</span>
                    </>
                  ) : (
                    <>
                      <Folder className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{relativePath}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'title',
        header: ({ column }) => (
          <button
            className="flex items-center gap-1"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Title
            <ArrowUpDown className="h-4 w-4" />
          </button>
        ),
        cell: ({ row }) => {
          // Don't show title content for synthetic group rows (shown in ID column)
          if (row.original._isGroup) {
            return null;
          }
          const blockerCount = countOpenBlockers(row.original, issueMap);
          // Count all descendants, separating regular children from verifications
          const countDescendants = (subRows: IssueWithChildren[] | undefined): {
            total: number;
            closed: number;
            pendingVerification: number;
            verificationTotal: number;
            verificationClosed: number;
          } => {
            if (!subRows || subRows.length === 0) {
              return { total: 0, closed: 0, pendingVerification: 0, verificationTotal: 0, verificationClosed: 0 };
            }
            let total = 0;
            let closed = 0;
            let pendingVerification = 0;
            let verificationTotal = 0;
            let verificationClosed = 0;
            for (const child of subRows) {
              if (child.type === 'verification') {
                verificationTotal += 1;
                if (child.status === 'closed') verificationClosed += 1;
              } else {
                total += 1;
                if (child.status === 'closed') closed += 1;
                else if (child.status === 'pending_verification') pendingVerification += 1;
              }
              // Recursively count grandchildren
              const grandchildren = countDescendants(child.subRows);
              total += grandchildren.total;
              closed += grandchildren.closed;
              pendingVerification += grandchildren.pendingVerification;
              verificationTotal += grandchildren.verificationTotal;
              verificationClosed += grandchildren.verificationClosed;
            }
            return { total, closed, pendingVerification, verificationTotal, verificationClosed };
          };
          const { total: childCount, closed: closedCount, pendingVerification: pendingCount, verificationTotal, verificationClosed } = countDescendants(row.original.subRows);
          const allDone = childCount > 0 && closedCount === childCount;
          const allVerified = verificationTotal > 0 && verificationClosed === verificationTotal;
          // Check if this is a verification issue
          const isVerification = row.original.type === 'verification';
          const verifiesId = row.original.verifies;
          const verifiesIssue = verifiesId ? issueMap.get(verifiesId) : undefined;
          const verifiesReady = verifiesIssue?.status === 'closed';
          return (
            <div className="flex items-center gap-2">
              <span className="font-medium">{row.getValue('title')}</span>
              {/* Verification indicator */}
              {isVerification && verifiesId && (
                <span
                  className={`text-xs px-1.5 py-0.5 rounded flex items-center gap-1 ${
                    verifiesReady
                      ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400'
                      : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                  }`}
                  title={verifiesReady ? 'Target closed - ready to verify' : 'Waiting for target to close'}
                >
                  <Search className="h-3 w-3" />
                  {verifiesIssue ? (
                    <button
                      className="hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectIssue(verifiesIssue);
                      }}
                    >
                      {verifiesId}
                    </button>
                  ) : (
                    <span>{verifiesId}</span>
                  )}
                </span>
              )}
              {childCount > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  allDone
                    ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                    : 'bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-400'
                }`}>
                  {closedCount}/{childCount} done{pendingCount > 0 && ` (${pendingCount} pending verification)`}
                </span>
              )}
              {verificationTotal > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  allVerified
                    ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-400'
                    : 'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-400'
                }`}>
                  {verificationClosed}/{verificationTotal} verification{verificationTotal === 1 ? '' : 's'}
                </span>
              )}
              {blockerCount > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400">
                  {blockerCount} blocker{blockerCount > 1 ? 's' : ''}
                </span>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'type',
        header: 'Type',
        cell: ({ row }) => {
          if (row.original._isGroup) return null;
          const type = row.getValue('type') as keyof typeof TYPE_BADGE_VARIANTS;
          return <Badge variant={TYPE_BADGE_VARIANTS[type]}>{type}</Badge>;
        },
        filterFn: (row, id, value) => {
          return value === '' || row.getValue(id) === value;
        },
      },
      {
        accessorKey: 'priority',
        header: ({ column }) => (
          <button
            className="flex items-center gap-1"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Priority
            <ArrowUpDown className="h-4 w-4" />
          </button>
        ),
        cell: ({ row }) => {
          if (row.original._isGroup) return null;
          const priority = row.getValue('priority') as keyof typeof PRIORITY_DISPLAY_LABELS;
          return (
            <span className={priority <= 1 ? 'font-semibold text-red-600' : ''}>
              {PRIORITY_DISPLAY_LABELS[priority]}
            </span>
          );
        },
        filterFn: (row, id, value) => {
          return value === '' || String(row.getValue(id)) === value;
        },
      },
      {
        accessorKey: 'status',
        header: ({ column }) => (
          <button
            className="flex items-center gap-1"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Status
            <ArrowUpDown className="h-4 w-4" />
          </button>
        ),
        cell: ({ row }) => {
          if (row.original._isGroup) return null;
          const status = row.getValue('status') as keyof typeof STATUS_BADGE_VARIANTS;
          return <Badge variant={STATUS_BADGE_VARIANTS[status]}>{status.replace('_', ' ')}</Badge>;
        },
        sortingFn: (rowA, rowB) => {
          const statusA = rowA.getValue('status') as string;
          const statusB = rowB.getValue('status') as string;
          return getStatusOrder(statusA) - getStatusOrder(statusB);
        },
        filterFn: (row, id, value) => {
          return value === '' || row.getValue(id) === value;
        },
      },
      {
        accessorKey: 'parent',
        header: 'Parent',
        cell: ({ row }) => {
          if (row.original._isGroup) return null;
          const parent = row.getValue('parent') as string | undefined;
          if (!parent) {
            return <span className="text-muted-foreground">—</span>;
          }
          const parentIssue = issueMap.get(parent);
          if (!parentIssue) {
            // Orphaned reference - render as plain text
            return (
              <span className="font-mono text-xs text-muted-foreground" title="Parent issue not found">
                {parent}
              </span>
            );
          }
          return (
            <button
              className="font-mono text-xs text-blue-600 hover:text-blue-800 hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                onSelectIssue(parentIssue);
              }}
            >
              {parent}
            </button>
          );
        },
      },
      {
        accessorKey: 'updatedAt',
        header: ({ column }) => (
          <button
            className="flex items-center gap-1"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
          >
            Updated
            <ArrowUpDown className="h-4 w-4" />
          </button>
        ),
        cell: ({ row }) => {
          if (row.original._isGroup) return null;
          const latestEvent = latestEventMap.get(row.original.id);
          if (!latestEvent) {
            return <span className="text-muted-foreground text-xs">—</span>;
          }
          return (
            <div className="text-xs" title={new Date(latestEvent.timestamp).toLocaleString()}>
              <span className="text-muted-foreground">
                {formatRelativeTime(latestEvent.timestamp)}
              </span>
              <span className="block text-muted-foreground/70">
                {getEventDescription(latestEvent)}
              </span>
            </div>
          );
        },
        sortingFn: (rowA, rowB) => {
          return new Date(rowA.original.updatedAt).getTime() - new Date(rowB.original.updatedAt).getTime();
        },
      },
    ],
    [issues, issueMap, latestEventMap, onSelectIssue, selectedIds, onToggleSelect, onSelectAll, visibleIssueIds, allSelected, someSelected, sourcePathPrefix]
  );

  const table = useReactTable({
    data: hierarchicalData,
    columns,
    state: {
      sorting,
      columnFilters,
      globalFilter,
      expanded,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onExpandedChange: setExpanded,
    getSubRows: (row) => row.subRows,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
    filterFromLeafRows: true, // Search through nested subRows when filtering
    globalFilterFn: (row, _columnId, filterValue) => {
      const issue = row.original;

      // Text search only (presets are handled by filteredIssues)
      const search = String(filterValue).toLowerCase();
      if (!search) return true;

      // Search title
      if (issue.title.toLowerCase().includes(search)) return true;
      // Search id
      if (issue.id.toLowerCase().includes(search)) return true;
      // Search type
      if (issue.type.toLowerCase().includes(search)) return true;
      // Search status
      if (issue.status.toLowerCase().includes(search)) return true;
      // Search description
      if (issue.description?.toLowerCase().includes(search)) return true;
      // Search comments
      if (issue.comments.some(c => c.text.toLowerCase().includes(search))) return true;

      return false;
    },
  });

  // Handle preset selection
  const handlePresetClick = (preset: FilterPreset) => {
    if (activePreset === preset) {
      // Toggle off
      setActivePreset(null);
    } else {
      setActivePreset(preset);
      // Clear column filters when using a preset
      setColumnFilters([]);
    }
  };

  // Check if any filter is active (for "Clear filters" button visibility)
  const hasActiveFilters = !!(
    activePreset ||
    globalFilter ||
    sourceFilter ||
    table.getColumn('status')?.getFilterValue() ||
    table.getColumn('type')?.getFilterValue() ||
    table.getColumn('priority')?.getFilterValue()
  );

  return (
    <div className="space-y-4">
      {/* Filter Presets */}
      <div className="flex gap-2">
        <Button
          variant={activePreset === 'ready' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handlePresetClick('ready')}
          className={cn(activePreset === 'ready' && 'bg-green-600 hover:bg-green-700')}
        >
          Ready
        </Button>
        <Button
          variant={activePreset === 'blocked' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handlePresetClick('blocked')}
          className={cn(activePreset === 'blocked' && 'bg-red-600 hover:bg-red-700')}
        >
          Blocked
        </Button>
        <Button
          variant={activePreset === 'in_progress' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handlePresetClick('in_progress')}
          className={cn(activePreset === 'in_progress' && 'bg-blue-600 hover:bg-blue-700')}
        >
          In Progress
        </Button>
        <Button
          variant={activePreset === 'all_open' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handlePresetClick('all_open')}
          className={cn(activePreset === 'all_open' && 'bg-amber-600 hover:bg-amber-700')}
        >
          All Open
        </Button>
        <Button
          variant={activePreset === 'verifications' ? 'default' : 'outline'}
          size="sm"
          onClick={() => handlePresetClick('verifications')}
          className={cn(activePreset === 'verifications' && 'bg-cyan-600 hover:bg-cyan-700')}
        >
          Verifications
        </Button>
        {activePreset && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setActivePreset(null)}
          >
            Clear
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-4">
        <Input
          placeholder="Search titles, descriptions, comments..."
          value={globalFilter ?? ''}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="max-w-sm"
        />
        <Select
          value={(table.getColumn('status')?.getFilterValue() as string) ?? ''}
          onChange={(e) =>
            table.getColumn('status')?.setFilterValue(e.target.value)
          }
        >
          <option value="">All Statuses</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="blocked">Blocked</option>
          <option value="closed">Closed</option>
        </Select>
        <Select
          value={(table.getColumn('type')?.getFilterValue() as string) ?? ''}
          onChange={(e) =>
            table.getColumn('type')?.setFilterValue(e.target.value)
          }
        >
          <option value="">All Types</option>
          <option value="task">Task</option>
          <option value="bug">Bug</option>
          <option value="epic">Epic</option>
          <option value="verification">Verification</option>
        </Select>
        <Select
          value={(table.getColumn('priority')?.getFilterValue() as string) ?? ''}
          onChange={(e) =>
            table.getColumn('priority')?.setFilterValue(e.target.value)
          }
        >
          <option value="">All Priorities</option>
          <option value="0">Critical</option>
          <option value="1">High</option>
          <option value="2">Medium</option>
          <option value="3">Low</option>
          <option value="4">Backlog</option>
        </Select>
        {uniqueSources.length > 1 && (
          <Select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="">All Sources</option>
            {uniqueSources.map((source) => (
              <option key={source} value={source}>
                {getRelativePath(source, sourcePathPrefix)}
              </option>
            ))}
          </Select>
        )}
        {/* Clear all filters button - show when any filter is active */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setActivePreset(null);
              setGlobalFilter('');
              setSourceFilter('');
              table.resetColumnFilters();
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4 mr-1" />
            Clear filters
          </Button>
        )}
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => {
                const isGroup = row.original._isGroup;
                const status = row.original.status;
                const rowHasOpenBlockers = isGroup ? false : hasOpenBlockers(row.original, issueMap);
                const statusBorder = isGroup ? 'border-l-4 border-l-gray-400' :
                  status === 'in_progress' ? 'border-l-4 border-l-blue-500' :
                  status === 'blocked' || rowHasOpenBlockers ? 'border-l-4 border-l-red-500' :
                  status === 'pending_verification' ? 'border-l-4 border-l-purple-500' :
                  status === 'closed' ? 'border-l-4 border-l-green-500' :
                  '';
                const isClosedRow = status === 'closed';
                return (
                <TableRow
                  key={row.id}
                  className={`${isGroup ? '' : 'cursor-pointer'} ${statusBorder} ${isClosedRow ? 'bg-muted/30 opacity-75' : ''} ${isGroup ? 'bg-muted/50' : ''}`}
                  onClick={() => !isGroup && onSelectIssue(row.original)}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              );
              })
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No issues found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="text-sm text-muted-foreground">
        {table.getFilteredRowModel().rows.length} of {issues.length} issue(s)
      </div>
    </div>
  );
}
