import React, { useState, useMemo } from 'react';
import type { IssueEvent, Issue } from '../../shared/types';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Badge } from './ui/badge';
import { Clock, Plus, Edit, XCircle, RefreshCw, MessageSquare, Folder, ChevronRight } from 'lucide-react';
import { formatRelativeTime } from '../lib/time';

interface EventGroup {
  issueId: string;
  events: IssueEvent[];
  firstTimestamp: string;
  lastTimestamp: string;
}

function groupConsecutiveEvents(events: IssueEvent[]): EventGroup[] {
  if (events.length === 0) return [];

  const groups: EventGroup[] = [];
  let currentGroup: EventGroup = {
    issueId: events[0].issueId,
    events: [events[0]],
    firstTimestamp: events[0].timestamp,
    lastTimestamp: events[0].timestamp,
  };

  for (let i = 1; i < events.length; i++) {
    const event = events[i];
    if (event.issueId === currentGroup.issueId) {
      // Same issue, add to current group
      currentGroup.events.push(event);
      currentGroup.lastTimestamp = event.timestamp;
    } else {
      // Different issue, start new group
      groups.push(currentGroup);
      currentGroup = {
        issueId: event.issueId,
        events: [event],
        firstTimestamp: event.timestamp,
        lastTimestamp: event.timestamp,
      };
    }
  }
  // Don't forget the last group
  groups.push(currentGroup);

  return groups;
}

// Get parent chain from issue up to root epic
function getParentChain(issueId: string, issueMap: Map<string, Issue>): Issue[] {
  const chain: Issue[] = [];
  let current = issueMap.get(issueId);

  while (current?.parent) {
    const parent = issueMap.get(current.parent);
    if (!parent || chain.includes(parent)) break; // Prevent cycles
    chain.push(parent);
    current = parent;
  }

  return chain; // [immediate parent, grandparent, ..., root]
}

export interface EventTimelineProps {
  events: IssueEvent[];
  issues: Issue[];
  onSelectIssue: (issue: Issue) => void;
  issueIds?: string[]; // Optional filter to specific issues
  showFilters?: boolean; // Show filter controls (default: true)
  maxEvents?: number; // Limit number of events shown
  // Lifted state props (optional - falls back to internal state)
  searchFilter?: string;
  onSearchFilterChange?: React.Dispatch<React.SetStateAction<string>>;
  typeFilter?: string;
  onTypeFilterChange?: React.Dispatch<React.SetStateAction<string>>;
  issueFilter?: string;
  onIssueFilterChange?: React.Dispatch<React.SetStateAction<string>>;
}

const eventTypeConfig: Record<
  string,
  { icon: React.ReactNode; label: string; color: string }
> = {
  create: {
    icon: <Plus className="h-4 w-4" />,
    label: 'Created',
    color: 'bg-green-100 text-green-800',
  },
  update: {
    icon: <Edit className="h-4 w-4" />,
    label: 'Updated',
    color: 'bg-blue-100 text-blue-800',
  },
  close: {
    icon: <XCircle className="h-4 w-4" />,
    label: 'Closed',
    color: 'bg-gray-100 text-gray-800',
  },
  reopen: {
    icon: <RefreshCw className="h-4 w-4" />,
    label: 'Reopened',
    color: 'bg-yellow-100 text-yellow-800',
  },
  comment: {
    icon: <MessageSquare className="h-4 w-4" />,
    label: 'Comment',
    color: 'bg-purple-100 text-purple-800',
  },
};

function formatEventData(event: IssueEvent): string {
  switch (event.type) {
    case 'create':
      return `${event.data.type} — "${event.data.title}" (priority: ${event.data.priority})`;

    case 'update': {
      const changes = Object.entries(event.data)
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join(', ');
      return changes || 'No details';
    }

    case 'close':
    case 'reopen':
      return event.data.reason || 'No reason provided';

    case 'comment': {
      const text = event.data.text;
      return text.length > 100 ? text.substring(0, 100) + '...' : text;
    }

    default: {
      // TypeScript exhaustiveness check
      const _exhaustive: never = event;
      return JSON.stringify(_exhaustive);
    }
  }
}

export function EventTimeline({
  events,
  issues,
  onSelectIssue,
  issueIds,
  showFilters = true,
  maxEvents,
  searchFilter: searchFilterProp,
  onSearchFilterChange,
  typeFilter: typeFilterProp,
  onTypeFilterChange,
  issueFilter: issueFilterProp,
  onIssueFilterChange,
}: EventTimelineProps) {
  // Internal state (used when props not provided)
  const [searchFilterInternal, setSearchFilterInternal] = useState('');
  const [typeFilterInternal, setTypeFilterInternal] = useState('');
  const [issueFilterInternal, setIssueFilterInternal] = useState('');

  // Use props if provided, otherwise use internal state
  const searchFilter = searchFilterProp ?? searchFilterInternal;
  const setSearchFilter = onSearchFilterChange ?? setSearchFilterInternal;
  const typeFilter = typeFilterProp ?? typeFilterInternal;
  const setTypeFilter = onTypeFilterChange ?? setTypeFilterInternal;
  const issueFilter = issueFilterProp ?? issueFilterInternal;
  const setIssueFilter = onIssueFilterChange ?? setIssueFilterInternal;

  const issueMap = useMemo(
    () => new Map(issues.map((i) => [i.id, i])),
    [issues]
  );

  // Pre-filter events by issueIds if provided
  const scopedEvents = useMemo(() => {
    if (!issueIds || issueIds.length === 0) return events;
    const idSet = new Set(issueIds);
    return events.filter((e) => idSet.has(e.issueId));
  }, [events, issueIds]);

  // Pre-compute stringified event data for search
  const eventDataStrings = useMemo(
    () => new Map(scopedEvents.map((e) => [e, JSON.stringify(e.data).toLowerCase()])),
    [scopedEvents]
  );

  const filteredEvents = useMemo(() => {
    let result = scopedEvents
      .filter((event) => {
        // Type filter
        if (typeFilter && event.type !== typeFilter) return false;

        // Issue filter (only if showFilters and not pre-filtered by issueIds)
        if (issueFilter && event.issueId !== issueFilter) return false;

        // Search filter
        if (searchFilter) {
          const issue = issueMap.get(event.issueId);
          const searchLower = searchFilter.toLowerCase();
          const titleMatch = issue?.title.toLowerCase().includes(searchLower);
          const idMatch = event.issueId.toLowerCase().includes(searchLower);
          const dataMatch = eventDataStrings.get(event)?.includes(searchLower);
          if (!titleMatch && !idMatch && !dataMatch) return false;
        }

        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

    // Apply maxEvents limit
    if (maxEvents && result.length > maxEvents) {
      result = result.slice(0, maxEvents);
    }

    return result;
  }, [scopedEvents, typeFilter, issueFilter, searchFilter, issueMap, eventDataStrings, maxEvents]);

  // Issues to show in dropdown (either all or scoped)
  const dropdownIssues = useMemo(() => {
    if (!issueIds || issueIds.length === 0) return issues;
    return issues.filter((i) => issueIds.includes(i.id));
  }, [issues, issueIds]);

  // Group consecutive events by issueId
  const eventGroups = useMemo(
    () => groupConsecutiveEvents(filteredEvents),
    [filteredEvents]
  );

  // Compute reverse lookup: what each issue blocks (issues that have this issue in blockedBy)
  const blockingMap = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const issue of issues) {
      for (const blockerId of issue.blockedBy) {
        const existing = map.get(blockerId) || [];
        existing.push(issue.id);
        map.set(blockerId, existing);
      }
    }
    return map;
  }, [issues]);

  return (
    <div className="space-y-4">
      {showFilters && (
        <>
          <div className="flex flex-wrap gap-4">
            <Input
              placeholder="Search history..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="max-w-sm"
            />
            <Select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              <option value="">All Event Types</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="close">Close</option>
              <option value="reopen">Reopen</option>
              <option value="comment">Comment</option>
            </Select>
            {!issueIds && (
              <Select
                value={issueFilter}
                onChange={(e) => setIssueFilter(e.target.value)}
              >
                <option value="">All Issues</option>
                {dropdownIssues.map((issue) => (
                  <option key={issue.id} value={issue.id}>
                    {issue.id} — {issue.title.substring(0, 30)}
                    {issue.title.length > 30 ? '...' : ''}
                  </option>
                ))}
              </Select>
            )}
          </div>

          <div className="text-sm text-muted-foreground">
            {filteredEvents.length} of {scopedEvents.length} event(s)
            {maxEvents && scopedEvents.length > maxEvents && ` (showing first ${maxEvents})`}
          </div>
        </>
      )}

      <div className="relative">
        {/* Timeline line */}
        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />

        <div className="space-y-4">
          {eventGroups.map((group) => {
            const issue = issueMap.get(group.issueId);
            const groupKey = `${group.issueId}-${group.firstTimestamp}`;
            const hasMultipleEvents = group.events.length > 1;
            const blockedByIds = issue?.blockedBy || [];
            const blocksIds = blockingMap.get(group.issueId) || [];

            return (
              <div key={groupKey} className="relative pl-10">
                {/* Group container with visual distinction for multi-event groups */}
                <div className={hasMultipleEvents ? 'bg-muted/30 border border-border/50 rounded-lg p-2' : ''}>
                  {/* Group header for multi-event groups */}
                  {hasMultipleEvents && (
                    <div className="mb-2 px-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {issue ? (
                            <button
                              className="text-sm font-medium text-primary hover:underline font-mono"
                              onClick={() => onSelectIssue(issue)}
                            >
                              {group.issueId}
                            </button>
                          ) : (
                            <span className="text-sm font-mono text-muted-foreground">
                              {group.issueId}
                            </span>
                          )}
                          {issue && (
                            <span className="text-sm text-muted-foreground">
                              — {issue.title}
                            </span>
                          )}
                          {issue?._sources?.[0] && (
                            <span
                              className="text-xs text-muted-foreground flex items-center gap-0.5"
                              title={issue._sources[0]}
                            >
                              <Folder className="h-3 w-3" />
                              {issue._sources[0]}
                            </span>
                          )}
                          <Badge variant="secondary" className="text-xs">
                            {group.events.length} events
                          </Badge>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {formatRelativeTime(group.firstTimestamp)}
                        </div>
                      </div>
                      {/* Dependencies row */}
                      {(blockedByIds.length > 0 || blocksIds.length > 0) && (
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {blockedByIds.length > 0 && (
                            <span>
                              Blocked by:{' '}
                              {blockedByIds.map((id, i) => {
                                const blocker = issueMap.get(id);
                                return (
                                  <span key={id}>
                                    {i > 0 && ', '}
                                    {blocker ? (
                                      <button
                                        className="text-primary hover:underline font-mono"
                                        onClick={() => onSelectIssue(blocker)}
                                      >
                                        {id}
                                      </button>
                                    ) : (
                                      <span className="font-mono">{id}</span>
                                    )}
                                  </span>
                                );
                              })}
                            </span>
                          )}
                          {blocksIds.length > 0 && (
                            <span>
                              Blocks:{' '}
                              {blocksIds.map((id, i) => {
                                const blocked = issueMap.get(id);
                                return (
                                  <span key={id}>
                                    {i > 0 && ', '}
                                    {blocked ? (
                                      <button
                                        className="text-primary hover:underline font-mono"
                                        onClick={() => onSelectIssue(blocked)}
                                      >
                                        {id}
                                      </button>
                                    ) : (
                                      <span className="font-mono">{id}</span>
                                    )}
                                  </span>
                                );
                              })}
                            </span>
                          )}
                        </div>
                      )}
                      {/* Parent chain row */}
                      {(() => {
                        const parentChain = getParentChain(group.issueId, issueMap);
                        if (parentChain.length === 0) return null;
                        const reversed = [...parentChain].reverse(); // root → ... → immediate parent
                        return (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <span>Parent:</span>
                            {reversed.map((parent, idx) => (
                              <span key={parent.id} className="flex items-center">
                                {idx > 0 && <ChevronRight className="h-3 w-3 mx-0.5" />}
                                <button
                                  className="text-primary hover:underline font-mono"
                                  onClick={() => onSelectIssue(parent)}
                                >
                                  {parent.id}
                                </button>
                              </span>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Events in the group */}
                  <div className={hasMultipleEvents ? 'space-y-2' : 'space-y-4'}>
                    {group.events.map((event) => {
                      const config = eventTypeConfig[event.type];
                      const eventKey = `${event.issueId}-${event.timestamp}-${event.type}`;

                      return (
                        <div key={eventKey} className="relative">
                          {/* Timeline dot - positioned differently for single vs multi */}
                          {!hasMultipleEvents && (
                            <div
                              className={`absolute -left-8 w-5 h-5 rounded-full flex items-center justify-center ${config.color}`}
                            >
                              {config.icon}
                            </div>
                          )}

                          <div className="bg-card border rounded-lg p-4 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                {hasMultipleEvents && (
                                  <div className={`w-5 h-5 rounded-full flex items-center justify-center ${config.color}`}>
                                    {config.icon}
                                  </div>
                                )}
                                <Badge variant="outline" className={config.color}>
                                  {config.label}
                                </Badge>
                                {/* Only show issue link for single-event groups */}
                                {!hasMultipleEvents && (
                                  <>
                                    {issue ? (
                                      <button
                                        className="text-sm text-primary hover:underline font-mono"
                                        onClick={() => onSelectIssue(issue)}
                                      >
                                        {event.issueId}
                                      </button>
                                    ) : (
                                      <span className="text-sm font-mono text-muted-foreground">
                                        {event.issueId}
                                      </span>
                                    )}
                                    {issue && (
                                      <span className="text-sm text-muted-foreground">
                                        — {issue.title}
                                      </span>
                                    )}
                                    {issue?._sources?.[0] && (
                                      <span
                                        className="text-xs text-muted-foreground flex items-center gap-0.5"
                                        title={issue._sources[0]}
                                      >
                                        <Folder className="h-3 w-3" />
                                        {issue._sources[0]}
                                      </span>
                                    )}
                                  </>
                                )}
                              </div>
                              <div className="flex items-center gap-1 text-xs text-muted-foreground" title={new Date(event.timestamp).toLocaleString()}>
                                <Clock className="h-3 w-3" />
                                {formatRelativeTime(event.timestamp)}
                              </div>
                            </div>

                            <p className="text-sm text-muted-foreground">
                              {formatEventData(event)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}

          {filteredEvents.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No events found{showFilters ? ' matching your filters' : ''}.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
