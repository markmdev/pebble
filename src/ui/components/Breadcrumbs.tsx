import { useMemo } from 'react';
import type { Issue } from '../../shared/types';
import { ChevronRight, Home } from 'lucide-react';

type View = 'list' | 'dashboard' | 'graph' | 'history';

interface BreadcrumbsProps {
  view: View;
  selectedIssue: Issue | null;
  graphRootId: string | null;
  allIssues: Issue[];
  onClearSelection: () => void;
  onSelectIssue: (issue: Issue) => void;
  onNavigateToView: (view: View) => void;
}

export function Breadcrumbs({
  view,
  selectedIssue,
  graphRootId,
  allIssues,
  onClearSelection,
  onSelectIssue,
  onNavigateToView,
}: BreadcrumbsProps) {
  const issueMap = useMemo(() => new Map(allIssues.map((i) => [i.id, i])), [allIssues]);
  const graphRootIssue = graphRootId ? issueMap.get(graphRootId) : null;

  // Build breadcrumb trail
  const crumbs: { label: string; onClick?: () => void }[] = [];

  // First crumb is always the view
  const viewLabels: Record<View, string> = {
    list: 'List',
    dashboard: 'Dashboard',
    graph: 'Graph',
    history: 'History',
  };

  crumbs.push({
    label: viewLabels[view],
    onClick: () => {
      onClearSelection();
      onNavigateToView(view);
    },
  });

  // For graph view with a focused root
  if (view === 'graph' && graphRootIssue) {
    crumbs.push({
      label: `Focused: ${graphRootIssue.id}`,
    });
  }

  // For selected issue, show parent chain
  if (selectedIssue) {
    // Build parent chain
    const parentChain: Issue[] = [];
    let current = selectedIssue;
    while (current.parent) {
      const parent = issueMap.get(current.parent);
      if (parent) {
        parentChain.unshift(parent);
        current = parent;
      } else {
        break;
      }
    }

    // Add each parent as a crumb
    for (const parent of parentChain) {
      crumbs.push({
        label: truncate(parent.title, 20),
        onClick: () => onSelectIssue(parent),
      });
    }

    // Add the selected issue itself (no click handler - current location)
    crumbs.push({
      label: truncate(selectedIssue.title, 25),
    });
  }

  // Don't show breadcrumbs if only one item
  if (crumbs.length <= 1) {
    return null;
  }

  return (
    <nav className="flex items-center text-sm text-muted-foreground px-4 py-2 bg-muted/30 border-b">
      <Home className="h-4 w-4 mr-2" />
      {crumbs.map((crumb, index) => (
        <span key={index} className="flex items-center">
          {index > 0 && <ChevronRight className="h-4 w-4 mx-1" />}
          {crumb.onClick ? (
            <button
              className="hover:text-foreground hover:underline"
              onClick={crumb.onClick}
            >
              {crumb.label}
            </button>
          ) : (
            <span className="text-foreground font-medium">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.substring(0, maxLen - 1) + '…';
}
