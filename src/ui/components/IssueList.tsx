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
import { formatRelativeTime } from '../lib/time';
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
import { ArrowUpDown, ChevronRight, ChevronDown, GitBranch, FolderSync, Folder, Search } from 'lucide-react';
import { cn } from '../lib/utils';

export type FilterPreset = 'ready' | 'blocked' | 'in_progress' | 'all_open' | 'verifications' | null;
import { getStatusOrder } from '../lib/sort';

export interface IssueListProps {
  issues: Issue[];
  events: IssueEvent[];
  onSelectIssue: (issue: Issue) => void;
  onFocusGraph?: (issueId: string) => void;
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
}

// Extended issue type with subRows for TanStack hierarchy
interface IssueWithChildren extends Issue {
  subRows?: IssueWithChildren[];
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
function buildHierarchy(issues: Issue[]): IssueWithChildren[] {
  const issueMap = new Map(issues.map((i) => [i.id, i]));
  const childrenByParent = new Map<string, Issue[]>();

  // Group children by parent
  for (const issue of issues) {
    if (issue.parent && issueMap.has(issue.parent)) {
      const children = childrenByParent.get(issue.parent) || [];
      children.push(issue);
      childrenByParent.set(issue.parent, children);
    }
  }

  // Recursively build hierarchy for an issue
  function buildIssueWithChildren(issue: Issue): IssueWithChildren {
    const children = childrenByParent.get(issue.id) || [];
    // Sort children: open issues first (by status), closed at bottom
    const sortedChildren = [...children].sort((a, b) => {
      return getStatusOrder(a.status) - getStatusOrder(b.status);
    });

    // Recursively build children's children
    const subRows = sortedChildren.length > 0
      ? sortedChildren.map(child => buildIssueWithChildren(child))
      : undefined;

    return {
      ...issue,
      subRows,
    };
  }

  // Build top level (issues without parents or with missing parents)
  const topLevel: IssueWithChildren[] = [];
  for (const issue of issues) {
    // Skip if this issue has a valid parent (it will be nested)
    if (issue.parent && issueMap.has(issue.parent)) {
      continue;
    }
    topLevel.push(buildIssueWithChildren(issue));
  }

  // Sort top level: issues with children first, then by status
  return topLevel.sort((a, b) => {
    // Issues with children first
    const aHasChildren = (a.subRows?.length ?? 0) > 0;
    const bHasChildren = (b.subRows?.length ?? 0) > 0;
    if (aHasChildren !== bHasChildren) {
      return aHasChildren ? -1 : 1;
    }
    // Then by status
    return getStatusOrder(a.status) - getStatusOrder(b.status);
  });
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
  onFocusGraph,
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
}: IssueListProps) {
  // Unused for now, will be used by BulkActionBar
  void _onClearSelection;

  // Internal state (used when props not provided)
  const [sortingInternal, setSortingInternal] = useState<SortingState>([
    { id: 'updatedAt', desc: true } // Default: newest updates first
  ]);
  const [columnFiltersInternal, setColumnFiltersInternal] = useState<ColumnFiltersState>([]);
  const [globalFilterInternal, setGlobalFilterInternal] = useState('');
  const [expandedInternal, setExpandedInternal] = useState<ExpandedState>(true); // Start expanded
  const [activePresetInternal, setActivePresetInternal] = useState<FilterPreset>(null);

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

  // Apply preset filtering BEFORE hierarchy (fixes preset reactivity)
  const filteredIssues = useMemo(() => {
    if (!activePreset) return issues;

    return issues.filter((issue) => {
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
  }, [issues, activePreset, issueMap]);

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
        cell: ({ row }) => (
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
        ),
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
          return (
            <div
              className="flex items-center"
              style={{ paddingLeft: `${depth * 24}px` }}
            >
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
              {onFocusGraph && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onFocusGraph(row.original.id);
                  }}
                  className="ml-1 p-0.5 text-muted-foreground hover:text-blue-600 hover:bg-blue-50 rounded"
                  title="View in graph"
                >
                  <GitBranch className="h-3.5 w-3.5" />
                </button>
              )}
              {/* Source file indicator */}
              {row.original._sources?.[0] && (
                <span
                  className="ml-1 text-xs text-muted-foreground flex items-center gap-0.5"
                  title={row.original._sources[0]}
                >
                  {(row.original._sources.length ?? 0) > 1 ? (
                    <>
                      <FolderSync className="h-3 w-3" />
                      <span>{row.original._sources.length}</span>
                    </>
                  ) : (
                    <>
                      <Folder className="h-3 w-3" />
                      <span className="truncate">{row.original._sources[0]}</span>
                    </>
                  )}
                </span>
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
          const blockerCount = countOpenBlockers(row.original, issueMap);
          // Count all descendants (children + grandchildren + ...) using subRows
          const countDescendants = (subRows: IssueWithChildren[] | undefined): { total: number; closed: number } => {
            if (!subRows || subRows.length === 0) return { total: 0, closed: 0 };
            let total = 0;
            let closed = 0;
            for (const child of subRows) {
              total += 1;
              if (child.status === 'closed') closed += 1;
              // Recursively count grandchildren
              const grandchildren = countDescendants(child.subRows);
              total += grandchildren.total;
              closed += grandchildren.closed;
            }
            return { total, closed };
          };
          const { total: childCount, closed: closedCount } = countDescendants(row.original.subRows);
          const allDone = childCount > 0 && closedCount === childCount;
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
                    ? 'bg-green-100 text-green-700'
                    : 'bg-purple-100 text-purple-700'
                }`}>
                  {closedCount}/{childCount} done
                </span>
              )}
              {blockerCount > 0 && (
                <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">
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
    [issues, issueMap, latestEventMap, onSelectIssue, onFocusGraph, selectedIds, onToggleSelect, onSelectAll, visibleIssueIds, allSelected, someSelected]
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
                const status = row.original.status;
                const rowHasOpenBlockers = hasOpenBlockers(row.original, issueMap);
                const statusBorder =
                  status === 'in_progress' ? 'border-l-4 border-l-blue-500' :
                  status === 'blocked' || rowHasOpenBlockers ? 'border-l-4 border-l-red-500' :
                  status === 'closed' ? 'border-l-4 border-l-green-500' :
                  '';
                return (
                <TableRow
                  key={row.id}
                  className={`cursor-pointer ${statusBorder}`}
                  onClick={() => onSelectIssue(row.original)}
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
