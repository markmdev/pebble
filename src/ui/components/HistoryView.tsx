import React from 'react';
import type { IssueEvent, Issue } from '../../shared/types';
import { EventTimeline } from './EventTimeline';

interface HistoryViewProps {
  events: IssueEvent[];
  issues: Issue[];
  onSelectIssue: (issue: Issue) => void;
  // Lifted state props (optional - falls back to EventTimeline internal state)
  searchFilter?: string;
  onSearchFilterChange?: React.Dispatch<React.SetStateAction<string>>;
  typeFilter?: string;
  onTypeFilterChange?: React.Dispatch<React.SetStateAction<string>>;
  issueFilter?: string;
  onIssueFilterChange?: React.Dispatch<React.SetStateAction<string>>;
}

export function HistoryView({
  events,
  issues,
  onSelectIssue,
  searchFilter,
  onSearchFilterChange,
  typeFilter,
  onTypeFilterChange,
  issueFilter,
  onIssueFilterChange,
}: HistoryViewProps) {
  return (
    <EventTimeline
      events={events}
      issues={issues}
      onSelectIssue={onSelectIssue}
      showFilters={true}
      searchFilter={searchFilter}
      onSearchFilterChange={onSearchFilterChange}
      typeFilter={typeFilter}
      onTypeFilterChange={onTypeFilterChange}
      issueFilter={issueFilter}
      onIssueFilterChange={onIssueFilterChange}
    />
  );
}
