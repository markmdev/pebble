import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Toaster } from 'sonner';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import { useIssues } from './hooks/useIssues';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { IssueList, type FilterPreset } from './components/IssueList';
import { IssueDetail } from './components/IssueDetail';
import type { SortingState, ColumnFiltersState, ExpandedState } from '@tanstack/react-table';
import { DependencyGraph } from './components/DependencyGraph';
import { HistoryView } from './components/HistoryView';
import { Dashboard } from './components/Dashboard';
import { Breadcrumbs } from './components/Breadcrumbs';
import { CreateIssueForm } from './components/CreateIssueForm';
import { BulkActionBar } from './components/BulkActionBar';
import { ThemeToggle } from './components/ThemeToggle';
import { SourceManager } from './components/SourceManager';
import { Button } from './components/ui/button';
import type { Issue } from '../shared/types';
import { fetchSources, type SourcesResponse } from './lib/api';
import { List, GitBranch, History, LayoutDashboard, RefreshCw, Loader2, Plus, FolderSync } from 'lucide-react';

type View = 'list' | 'dashboard' | 'graph' | 'history';

function AppContent() {
  const { resolvedTheme } = useTheme();
  const { issues, events, loading, error, refresh } = useIssues();
  const [view, setView] = useState<View>('list');
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const [graphRootId, setGraphRootId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Source management state
  const [sources, setSources] = useState<SourcesResponse | null>(null);
  const [sourceManagerOpen, setSourceManagerOpen] = useState(false);

  // Fetch sources on mount
  useEffect(() => {
    fetchSources()
      .then(setSources)
      .catch(() => setSources(null));
  }, []);

  // Lifted IssueList filter state (persists across tab switches)
  const [listSorting, setListSorting] = useState<SortingState>([
    { id: 'updatedAt', desc: true }
  ]);
  const [listColumnFilters, setListColumnFilters] = useState<ColumnFiltersState>([]);
  const [listGlobalFilter, setListGlobalFilter] = useState('');
  const [listExpanded, setListExpanded] = useState<ExpandedState>(true);
  const [listActivePreset, setListActivePreset] = useState<FilterPreset>(null);

  // Lifted HistoryView filter state (persists across tab switches)
  const [historySearchFilter, setHistorySearchFilter] = useState('');
  const [historyTypeFilter, setHistoryTypeFilter] = useState('');
  const [historyIssueFilter, setHistoryIssueFilter] = useState('');

  // Get all epics for the create form parent selector
  const epics = useMemo(() => issues.filter((i) => i.type === 'epic'), [issues]);

  // Close detail panel when view changes, and clear graph root
  const handleViewChange = (newView: View) => {
    setSelectedIssue(null);
    if (newView !== 'graph') {
      setGraphRootId(null);
    }
    setView(newView);
  };

  // Focus graph on a specific issue
  const handleFocusGraph = (issueId: string) => {
    setGraphRootId(issueId);
    setView('graph');
  };

  const handleSelectIssue = (issue: Issue) => {
    setSelectedIssue(issue);
  };

  const handleCloseDetail = () => {
    setSelectedIssue(null);
  };

  // Bulk selection handlers
  const handleToggleSelect = useCallback((issueId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(issueId)) {
        next.delete(issueId);
      } else {
        next.add(issueId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback((issueIds: string[]) => {
    setSelectedIds(new Set(issueIds));
  }, []);

  const handleClearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Ref for focusing comment input via keyboard shortcut
  const commentInputRef = useRef<HTMLTextAreaElement>(null);

  // Keyboard navigation index (for j/k shortcuts in list view)
  const [keyboardIndex, setKeyboardIndex] = useState(-1);

  // Get flat list of visible issues for keyboard navigation
  const visibleIssues = useMemo(() => {
    // In list view, return all issues (hierarchical navigation is complex, use flat for simplicity)
    return issues;
  }, [issues]);

  // Keyboard shortcut handlers
  const handleNewIssueShortcut = useCallback(() => {
    setCreateDialogOpen(true);
  }, []);

  const handleNavigateNext = useCallback(() => {
    if (view !== 'list' || visibleIssues.length === 0) return;
    setKeyboardIndex((prev) => {
      const next = Math.min(prev + 1, visibleIssues.length - 1);
      setSelectedIssue(visibleIssues[next]);
      return next;
    });
  }, [view, visibleIssues]);

  const handleNavigatePrev = useCallback(() => {
    if (view !== 'list' || visibleIssues.length === 0) return;
    setKeyboardIndex((prev) => {
      const next = Math.max(prev - 1, 0);
      setSelectedIssue(visibleIssues[next]);
      return next;
    });
  }, [view, visibleIssues]);

  const handleOpenDetailShortcut = useCallback(() => {
    if (keyboardIndex >= 0 && keyboardIndex < visibleIssues.length) {
      setSelectedIssue(visibleIssues[keyboardIndex]);
    }
  }, [keyboardIndex, visibleIssues]);

  const handleFocusComment = useCallback(() => {
    if (selectedIssue && commentInputRef.current) {
      commentInputRef.current.focus();
    }
  }, [selectedIssue]);

  // Register keyboard shortcuts
  useKeyboardShortcuts({
    onNewIssue: handleNewIssueShortcut,
    onNavigateNext: handleNavigateNext,
    onNavigatePrev: handleNavigatePrev,
    onOpenDetail: handleOpenDetailShortcut,
    onFocusComment: handleFocusComment,
  });

  // Update selected issue when issues are refreshed
  useEffect(() => {
    if (selectedIssue) {
      const updated = issues.find((i) => i.id === selectedIssue.id);
      if (updated) {
        setSelectedIssue(updated);
      } else {
        // Issue was deleted, close the panel
        setSelectedIssue(null);
      }
    }
  }, [issues, selectedIssue?.id]);

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-destructive">Error</h1>
          <p className="text-muted-foreground">{error.message}</p>
          <Button onClick={refresh}>Try Again</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b sticky top-0 bg-background z-10">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold">pebble</h1>
            <span className="text-sm text-muted-foreground">
              {issues.length} issues
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => setCreateDialogOpen(true)}
              title="New Issue (n)"
            >
              <Plus className="h-4 w-4 mr-1" />
              New Issue
            </Button>

            <div className="flex border rounded-lg">
              <Button
                variant={view === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleViewChange('list')}
                className="rounded-r-none"
              >
                <List className="h-4 w-4 mr-1" />
                List
              </Button>
              <Button
                variant={view === 'dashboard' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleViewChange('dashboard')}
                className="rounded-none border-x"
              >
                <LayoutDashboard className="h-4 w-4 mr-1" />
                Dashboard
              </Button>
              <Button
                variant={view === 'graph' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleViewChange('graph')}
                className="rounded-none border-x"
              >
                <GitBranch className="h-4 w-4 mr-1" />
                Graph
              </Button>
              <Button
                variant={view === 'history' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => handleViewChange('history')}
                className="rounded-l-none"
              >
                <History className="h-4 w-4 mr-1" />
                History
              </Button>
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={refresh}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => setSourceManagerOpen(true)}
              title="Manage issue sources"
            >
              <FolderSync className="h-4 w-4" />
              {sources?.isMultiWorktree && (
                <span className="ml-1 text-xs">{sources.files.length}</span>
              )}
            </Button>

            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Breadcrumbs */}
      <Breadcrumbs
        view={view}
        selectedIssue={selectedIssue}
        graphRootId={graphRootId}
        allIssues={issues}
        onClearSelection={handleCloseDetail}
        onSelectIssue={handleSelectIssue}
        onNavigateToView={handleViewChange}
      />

      {/* Main content */}
      <main
        className={`px-4 py-6 transition-all duration-200 ${
          selectedIssue ? 'mr-[500px]' : ''
        }`}
      >
        {loading && issues.length === 0 ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {view === 'list' && (
              <>
                <BulkActionBar
                  selectedIds={selectedIds}
                  onClearSelection={handleClearSelection}
                  onRefresh={refresh}
                />
                <IssueList
                  issues={issues}
                  events={events}
                  onSelectIssue={handleSelectIssue}
                  onFocusGraph={handleFocusGraph}
                  selectedIds={selectedIds}
                  onToggleSelect={handleToggleSelect}
                  onSelectAll={handleSelectAll}
                  onClearSelection={handleClearSelection}
                  sorting={listSorting}
                  onSortingChange={setListSorting}
                  columnFilters={listColumnFilters}
                  onColumnFiltersChange={setListColumnFilters}
                  globalFilter={listGlobalFilter}
                  onGlobalFilterChange={setListGlobalFilter}
                  expanded={listExpanded}
                  onExpandedChange={setListExpanded}
                  activePreset={listActivePreset}
                  onActivePresetChange={setListActivePreset}
                />
              </>
            )}
            {view === 'dashboard' && (
              <Dashboard
                issues={issues}
                events={events}
                onSelectIssue={handleSelectIssue}
              />
            )}
            {view === 'graph' && (
              <div className="h-[calc(100vh-150px)]">
                <DependencyGraph
                  issues={issues}
                  onSelectIssue={handleSelectIssue}
                  rootIssueId={graphRootId ?? undefined}
                  onClearRoot={() => setGraphRootId(null)}
                />
              </div>
            )}
            {view === 'history' && (
              <HistoryView
                events={events}
                issues={issues}
                onSelectIssue={handleSelectIssue}
                searchFilter={historySearchFilter}
                onSearchFilterChange={setHistorySearchFilter}
                typeFilter={historyTypeFilter}
                onTypeFilterChange={setHistoryTypeFilter}
                issueFilter={historyIssueFilter}
                onIssueFilterChange={setHistoryIssueFilter}
              />
            )}
          </>
        )}
      </main>

      {/* Issue detail panel */}
      {selectedIssue && (
        <IssueDetail
          issue={selectedIssue}
          allIssues={issues}
          events={events}
          onClose={handleCloseDetail}
          onSelectIssue={handleSelectIssue}
          onFocusGraph={handleFocusGraph}
          onRefresh={refresh}
          commentInputRef={commentInputRef}
        />
      )}

      {/* Create issue dialog */}
      <CreateIssueForm
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={refresh}
        epics={epics}
      />

      {/* Source manager modal */}
      {sourceManagerOpen && (
        <SourceManager
          sources={sources}
          onSourcesChange={(newSources) => {
            setSources(newSources);
            refresh(); // Refresh issues when sources change
          }}
          onClose={() => setSourceManagerOpen(false)}
        />
      )}

      {/* Toast notifications */}
      <Toaster position="bottom-right" richColors theme={resolvedTheme} />
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
