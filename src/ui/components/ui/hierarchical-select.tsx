import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, Check, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import type { Issue, Status } from '../../../shared/types';

interface HierarchicalSelectProps {
  epics: Issue[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

interface EpicNode {
  epic: Issue;
  children: Issue[];
  depth: number;
}

function getStatusColor(status: Status): string {
  const colors: Record<Status, string> = {
    open: 'bg-amber-500',
    in_progress: 'bg-blue-500',
    blocked: 'bg-red-500',
    closed: 'bg-green-500',
  };
  return colors[status] || 'bg-gray-500';
}

export function HierarchicalSelect({
  epics,
  value,
  onChange,
  disabled = false,
  placeholder = 'Select parent epic...',
}: HierarchicalSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Build hierarchical structure
  const { flatList, epicMap } = useMemo(() => {
    const map = new Map(epics.map((e) => [e.id, e]));

    // Build tree structure
    const nodes: EpicNode[] = [];
    const childrenMap = new Map<string, Issue[]>();

    // Count children for each epic
    for (const epic of epics) {
      if (epic.parent && map.has(epic.parent)) {
        const existing = childrenMap.get(epic.parent) || [];
        existing.push(epic);
        childrenMap.set(epic.parent, existing);
      }
    }

    // Build flat list with depth
    function addNode(epic: Issue, depth: number) {
      const children = childrenMap.get(epic.id) || [];
      nodes.push({ epic, children, depth });
      for (const child of children) {
        addNode(child, depth + 1);
      }
    }

    // Start with root-level epics (no parent or parent not in list)
    const rootEpics = epics.filter((e) => !e.parent || !map.has(e.parent));
    for (const epic of rootEpics) {
      addNode(epic, 0);
    }

    return { flatList: nodes, epicMap: map };
  }, [epics]);

  // Filter based on search
  const filteredList = useMemo(() => {
    if (!search.trim()) return flatList;
    const term = search.toLowerCase();
    return flatList.filter(
      (node) =>
        node.epic.title.toLowerCase().includes(term) ||
        node.epic.id.toLowerCase().includes(term)
    );
  }, [flatList, search]);

  // Selected epic display
  const selectedEpic = value ? epicMap.get(value) : null;

  // Reset highlight when list changes
  useEffect(() => {
    setHighlightedIndex(-1);
  }, [filteredList]);

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
            prev < filteredList.length - 1 ? prev + 1 : prev
          );
        }
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
        break;
      case 'Enter':
        e.preventDefault();
        if (open && highlightedIndex >= 0 && highlightedIndex < filteredList.length) {
          onChange(filteredList[highlightedIndex].epic.id);
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

  const handleSelect = (epicId: string) => {
    onChange(epicId);
    setOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setOpen(false);
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
        <span className={cn('truncate', !selectedEpic && 'text-muted-foreground')}>
          {selectedEpic ? (
            <span className="flex items-center gap-2">
              <span
                className={cn('h-2 w-2 rounded-full', getStatusColor(selectedEpic.status))}
              />
              <span className="font-mono text-xs text-muted-foreground">
                {selectedEpic.id}
              </span>
              <span className="truncate">{selectedEpic.title}</span>
            </span>
          ) : (
            placeholder
          )}
        </span>
        <span className="flex items-center gap-1">
          {selectedEpic && (
            <span
              role="button"
              onClick={handleClear}
              className="p-0.5 hover:bg-muted rounded"
            >
              <X className="h-3 w-3 text-muted-foreground" />
            </span>
          )}
          <ChevronDown
            className={cn(
              'h-4 w-4 text-muted-foreground transition-transform',
              open && 'rotate-180'
            )}
          />
        </span>
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
              placeholder="Search epics..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              autoFocus
            />
          </div>

          {/* Options list */}
          <div ref={listRef} className="max-h-60 overflow-y-auto py-1">
            {/* None option */}
            <div
              data-item
              onClick={() => handleSelect('')}
              className={cn(
                'flex cursor-pointer items-center px-3 py-2 text-sm hover:bg-accent',
                highlightedIndex === -1 && 'bg-accent',
                value === '' && 'font-medium'
              )}
            >
              <span className="text-muted-foreground">None</span>
              {value === '' && <Check className="ml-auto h-4 w-4" />}
            </div>

            {filteredList.length === 0 ? (
              <div className="px-3 py-2 text-sm text-muted-foreground">
                No epics found
              </div>
            ) : (
              filteredList.map((node, index) => {
                const childCount = node.children.length;
                const isSelected = value === node.epic.id;
                const isHighlighted = highlightedIndex === index;

                return (
                  <div
                    key={node.epic.id}
                    data-item
                    onClick={() => handleSelect(node.epic.id)}
                    className={cn(
                      'flex cursor-pointer items-center px-3 py-2 text-sm hover:bg-accent',
                      isHighlighted && 'bg-accent',
                      isSelected && 'font-medium'
                    )}
                    style={{ paddingLeft: `${12 + node.depth * 16}px` }}
                  >
                    {/* Status dot */}
                    <span
                      className={cn(
                        'mr-2 h-2 w-2 flex-shrink-0 rounded-full',
                        getStatusColor(node.epic.status)
                      )}
                    />

                    {/* ID */}
                    <span className="mr-2 font-mono text-xs text-muted-foreground">
                      {node.epic.id}
                    </span>

                    {/* Title */}
                    <span className="truncate">{node.epic.title}</span>

                    {/* Child count */}
                    {childCount > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({childCount})
                      </span>
                    )}

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
