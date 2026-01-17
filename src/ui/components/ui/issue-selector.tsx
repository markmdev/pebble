import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, Check, Bug, Circle, Diamond } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Issue, Status, IssueType } from '../../../shared/types';

interface IssueSelectorProps {
  issues: Issue[];
  value: string;
  onChange: (value: string) => void;
  excludeIds?: string[];
  disabled?: boolean;
  placeholder?: string;
}

function getStatusColor(status: Status): string {
  const colors: Record<Status, string> = {
    open: 'bg-amber-500',
    in_progress: 'bg-blue-500',
    blocked: 'bg-red-500',
    pending_verification: 'bg-purple-500',
    closed: 'bg-green-500',
  };
  return colors[status] || 'bg-gray-500';
}

function getTypeIcon(type: IssueType) {
  switch (type) {
    case 'bug':
      return <Bug className="h-3 w-3" />;
    case 'epic':
      return <Diamond className="h-3 w-3" />;
    default:
      return <Circle className="h-3 w-3" />;
  }
}

export function IssueSelector({
  issues,
  value,
  onChange,
  excludeIds = [],
  disabled = false,
  placeholder = 'Select an issue...',
}: IssueSelectorProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Filter out excluded issues and closed issues
  const availableIssues = useMemo(() => {
    const excludeSet = new Set(excludeIds);
    return issues.filter(
      (issue) => issue.status !== 'closed' && !excludeSet.has(issue.id)
    );
  }, [issues, excludeIds]);

  // Filter based on search
  const filteredIssues = useMemo(() => {
    if (!search.trim()) return availableIssues;
    const term = search.toLowerCase();
    return availableIssues.filter(
      (issue) =>
        issue.title.toLowerCase().includes(term) ||
        issue.id.toLowerCase().includes(term)
    );
  }, [availableIssues, search]);

  // Selected issue
  const selectedIssue = value
    ? issues.find((i) => i.id === value)
    : null;

  // Reset highlight when list changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [filteredIssues]);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) {
          setOpen(true);
        } else {
          setHighlightedIndex((prev) =>
            prev < filteredIssues.length - 1 ? prev + 1 : prev
          );
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (open && highlightedIndex >= 0 && highlightedIndex < filteredIssues.length) {
          onChange(filteredIssues[highlightedIndex].id);
          setOpen(false);
          setSearch('');
        } else if (!open) {
          setOpen(true);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        setSearch('');
        break;
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-item]');
      const item = items[highlightedIndex];
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightedIndex]);

  const handleSelect = (issueId: string) => {
    onChange(issueId);
    setOpen(false);
    setSearch('');
  };

  return (
    <div ref={containerRef} className="relative" onKeyDown={handleKeyDown}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => !disabled && setOpen(!open)}
        disabled={disabled}
        className={cn(
          'flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:cursor-not-allowed disabled:opacity-50',
          open && 'ring-2 ring-ring ring-offset-2'
        )}
      >
        <span className={cn('truncate', !selectedIssue && 'text-muted-foreground')}>
          {selectedIssue ? (
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground">
                {getTypeIcon(selectedIssue.type)}
              </span>
              <span
                className={cn('h-2 w-2 rounded-full', getStatusColor(selectedIssue.status))}
              />
              <span className="font-mono text-xs text-muted-foreground">
                {selectedIssue.id}
              </span>
              <span className="truncate">{selectedIssue.title}</span>
            </span>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 text-muted-foreground transition-transform flex-shrink-0',
            open && 'rotate-180'
          )}
        />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          {/* Search input */}
          <div className="flex items-center border-b px-3 py-2">
            <Search className="mr-2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search issues..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          </div>

          {/* Options list */}
          <div ref={listRef} className="max-h-60 overflow-y-auto py-1">
            {filteredIssues.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                {availableIssues.length === 0
                  ? 'No available issues'
                  : 'No issues match your search'}
              </div>
            ) : (
              filteredIssues.map((issue, index) => {
                const isSelected = value === issue.id;
                const isHighlighted = highlightedIndex === index;

                return (
                  <div
                    key={issue.id}
                    data-item
                    onClick={() => handleSelect(issue.id)}
                    className={cn(
                      'flex cursor-pointer items-center px-3 py-2 text-sm hover:bg-accent',
                      isHighlighted && 'bg-accent',
                      isSelected && 'font-medium'
                    )}
                  >
                    {/* Type icon */}
                    <span className="mr-2 text-muted-foreground">
                      {getTypeIcon(issue.type)}
                    </span>

                    {/* Status dot */}
                    <span
                      className={cn(
                        'mr-2 h-2 w-2 flex-shrink-0 rounded-full',
                        getStatusColor(issue.status)
                      )}
                    />

                    {/* ID */}
                    <span className="mr-2 font-mono text-xs text-muted-foreground">
                      {issue.id}
                    </span>

                    {/* Title */}
                    <span className="truncate">{issue.title}</span>

                    {/* Check mark if selected */}
                    {isSelected && <Check className="ml-auto h-4 w-4 flex-shrink-0" />}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
