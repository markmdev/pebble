import { useCallback, useMemo, useEffect } from 'react';
import ReactFlow, {
  Node,
  Edge,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  MarkerType,
} from 'reactflow';
import 'reactflow/dist/style.css';
import type { Issue } from '../../shared/types';
import { GraphLegend } from './GraphLegend';
import { getCommonPrefix, getRelativePath } from '../lib/path';

interface DependencyGraphProps {
  issues: Issue[];
  onSelectIssue: (issue: Issue) => void;
  rootIssueId?: string; // When set, show only this issue's dependency neighborhood
  onClearRoot?: () => void; // Callback to clear root filter
}

// CSS variable-based status colors for dark mode support
function getStatusColor(status: string): string {
  const varName = {
    open: '--graph-status-open',
    in_progress: '--graph-status-in-progress',
    blocked: '--graph-status-blocked',
    closed: '--graph-status-closed',
  }[status];
  if (!varName) return '#888';
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#888';
}

function getEdgeColor(type: 'blocked' | 'resolved' | 'parent' | 'verifies'): string {
  const varName = {
    blocked: '--graph-edge-blocked',
    resolved: '--graph-edge-resolved',
    parent: '--graph-edge-parent',
    verifies: '--graph-edge-verifies',
  }[type];
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
}

function getGraphStyles() {
  const style = getComputedStyle(document.documentElement);
  return {
    bg: style.getPropertyValue('--graph-bg').trim(),
    grid: style.getPropertyValue('--graph-grid').trim(),
    nodeBg: style.getPropertyValue('--graph-node-bg').trim(),
    nodeBorder: style.getPropertyValue('--graph-node-border').trim(),
  };
}

const typeIcons: Record<string, string> = {
  task: '◯',
  bug: '🐛',
  epic: '◆',
  verification: '🔍',
};

// Get bidirectional dependency neighborhood for an issue
function getNeighborhood(rootId: string, issues: Issue[]): Set<string> {
  const issueMap = new Map(issues.map((i) => [i.id, i]));
  const neighborhood = new Set<string>();

  // Traverse upstream (what blocks this issue, recursively)
  function traverseUpstream(id: string) {
    if (neighborhood.has(id)) return;
    neighborhood.add(id);
    const issue = issueMap.get(id);
    if (issue) {
      // Blockers
      for (const blockerId of issue.blockedBy) {
        traverseUpstream(blockerId);
      }
      // Parent
      if (issue.parent) {
        traverseUpstream(issue.parent);
      }
      // Verification target
      if (issue.verifies) {
        traverseUpstream(issue.verifies);
      }
    }
  }

  // Traverse downstream (what this issue blocks, recursively)
  function traverseDownstream(id: string) {
    if (neighborhood.has(id)) return;
    neighborhood.add(id);
    // Find issues that are blocked by this one
    for (const issue of issues) {
      if (issue.blockedBy.includes(id)) {
        traverseDownstream(issue.id);
      }
      // Find children
      if (issue.parent === id) {
        traverseDownstream(issue.id);
      }
      // Find verifications targeting this issue
      if (issue.verifies === id) {
        traverseDownstream(issue.id);
      }
    }
  }

  traverseUpstream(rootId);
  traverseDownstream(rootId);

  return neighborhood;
}

function buildGraph(issues: Issue[]): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const graphStyles = getGraphStyles();

  // Compute source path prefix for relative path display
  const allSources: string[] = [];
  for (const issue of issues) {
    if (issue._sources) {
      allSources.push(...issue._sources);
    }
  }
  const sourcePathPrefix = getCommonPrefix(allSources);
  const uniqueSources = new Set(allSources);
  const hasMultipleSources = uniqueSources.size > 1;

  // Calculate levels for layout
  const levels = new Map<string, number>();
  const visited = new Set<string>();
  const issueMap = new Map(issues.map((i) => [i.id, i]));

  function calculateLevel(id: string): number {
    if (levels.has(id)) return levels.get(id)!;
    if (visited.has(id)) return 0;
    visited.add(id);

    const issue = issueMap.get(id);
    if (!issue) return 0;

    let maxBlockerLevel = -1;
    for (const blockerId of issue.blockedBy) {
      const blockerLevel = calculateLevel(blockerId);
      maxBlockerLevel = Math.max(maxBlockerLevel, blockerLevel);
    }

    const level = maxBlockerLevel + 1;
    levels.set(id, level);
    return level;
  }

  issues.forEach((issue) => calculateLevel(issue.id));

  // Group by level for positioning
  const byLevel = new Map<number, Issue[]>();
  issues.forEach((issue) => {
    const level = levels.get(issue.id) || 0;
    if (!byLevel.has(level)) {
      byLevel.set(level, []);
    }
    byLevel.get(level)!.push(issue);
  });

  // Create nodes with positions
  const nodeWidth = 200;
  const nodeHeight = 90;  // Increased to give more room for node content
  const levelGap = 150;
  const nodeGap = 100;

  // Find max nodes in any level to calculate proper offset
  let maxNodesInLevel = 0;
  byLevel.forEach((levelIssues) => {
    maxNodesInLevel = Math.max(maxNodesInLevel, levelIssues.length);
  });

  // Calculate Y offset to ensure all nodes have positive Y values
  // Add extra padding at the top to ensure node content isn't cut off
  const yOffset = ((maxNodesInLevel - 1) / 2) * (nodeHeight + nodeGap) + 20;

  issues.forEach((issue) => {
    // Skip invalid issues
    if (!issue.id || !issue.title) return;

    const level = levels.get(issue.id) || 0;
    const levelIssues = byLevel.get(level) || [];
    const indexInLevel = levelIssues.indexOf(issue);
    const totalInLevel = levelIssues.length;

    const x = level * (nodeWidth + levelGap);
    // Center within level, then add offset to keep all Y values positive
    const y = (indexInLevel - (totalInLevel - 1) / 2) * (nodeHeight + nodeGap) + yOffset;

    const statusColor = getStatusColor(issue.status);
    const sourcePath = hasMultipleSources && issue._sources?.[0]
      ? getRelativePath(issue._sources[0], sourcePathPrefix)
      : null;

    nodes.push({
      id: issue.id,
      position: { x, y },
      data: {
        label: (
          <div className="text-left p-2">
            <div className="text-xs font-mono text-muted-foreground">
              {typeIcons[issue.type] || '○'} {issue.id}
            </div>
            <div className="text-sm font-medium truncate">{issue.title}</div>
            <div
              className="text-xs mt-1 px-1.5 py-0.5 rounded inline-block text-white"
              style={{ backgroundColor: statusColor }}
            >
              {issue.status?.replace('_', ' ') || 'unknown'}
            </div>
            {sourcePath && (
              <div className="text-xs mt-1 text-muted-foreground truncate" title={issue._sources?.[0]}>
                📁 {sourcePath}
              </div>
            )}
          </div>
        ),
        issue,
      },
      style: {
        width: nodeWidth,
        border: `2px solid ${statusColor}`,
        borderRadius: '8px',
        backgroundColor: graphStyles.nodeBg,
      },
    });
  });

  // Create edges for blockedBy dependencies (solid, red/green)
  issues.forEach((issue) => {
    issue.blockedBy.forEach((blockerId) => {
      if (issueMap.has(blockerId)) {
        const isResolved = issueMap.get(blockerId)?.status === 'closed';
        const edgeColor = getEdgeColor(isResolved ? 'resolved' : 'blocked');
        edges.push({
          id: `dep-${blockerId}-${issue.id}`,
          source: blockerId,
          target: issue.id,
          animated: !isResolved,
          style: {
            stroke: edgeColor,
          },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: edgeColor,
          },
        });
      }
    });
  });

  // Create edges for parent-child relationships (dashed, blue)
  const parentEdgeColor = getEdgeColor('parent');
  issues.forEach((issue) => {
    if (issue.parent && issueMap.has(issue.parent)) {
      edges.push({
        id: `parent-${issue.parent}-${issue.id}`,
        source: issue.parent,
        target: issue.id,
        style: {
          stroke: parentEdgeColor,
          strokeDasharray: '5,5', // dashed
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: parentEdgeColor,
        },
      });
    }
  });

  // Create edges for verifies relationships (dashed, cyan)
  const verifiesEdgeColor = getEdgeColor('verifies');
  issues.forEach((issue) => {
    if (issue.verifies && issueMap.has(issue.verifies)) {
      edges.push({
        id: `verifies-${issue.id}-${issue.verifies}`,
        source: issue.id,
        target: issue.verifies,
        style: {
          stroke: verifiesEdgeColor,
          strokeDasharray: '3,3', // shorter dashes to distinguish from parent
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: verifiesEdgeColor,
        },
      });
    }
  });

  return { nodes, edges };
}

export function DependencyGraph({ issues, onSelectIssue, rootIssueId, onClearRoot }: DependencyGraphProps) {
  // Get grid color from CSS variables for dark mode support
  const gridColor = useMemo(() => {
    return getComputedStyle(document.documentElement).getPropertyValue('--graph-grid').trim() || '#f0f0f0';
  }, []);

  // Filter issues if root is specified
  const filteredIssues = useMemo(() => {
    if (!rootIssueId) return issues;
    const neighborhood = getNeighborhood(rootIssueId, issues);
    return issues.filter((i) => neighborhood.has(i.id));
  }, [issues, rootIssueId]);

  const rootIssue = rootIssueId ? issues.find((i) => i.id === rootIssueId) : null;

  const { nodes: graphNodes, edges: graphEdges } = useMemo(
    () => buildGraph(filteredIssues),
    [filteredIssues]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(graphNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphEdges);

  // Update nodes and edges when issues change
  useEffect(() => {
    setNodes(graphNodes);
    setEdges(graphEdges);
  }, [graphNodes, graphEdges, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      // Look up fresh issue from current array to avoid stale closure
      const issue = issues.find(i => i.id === node.id);
      if (issue) {
        onSelectIssue(issue);
      }
    },
    [issues, onSelectIssue]
  );

  if (filteredIssues.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        No issues to display.
      </div>
    );
  }

  return (
    <div className="h-full w-full flex flex-col">
      {/* Filter header when focused on a root issue */}
      {rootIssue && onClearRoot && (
        <div className="flex items-center justify-between bg-blue-50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-700 px-4 py-2">
          <span className="text-sm text-blue-800 dark:text-blue-200">
            Focused on: <span className="font-mono font-medium">{rootIssue.id}</span> — {rootIssue.title}
            <span className="text-blue-600 dark:text-blue-400 ml-2">({filteredIssues.length} issues in neighborhood)</span>
          </span>
          <button
            onClick={onClearRoot}
            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-200 underline"
          >
            Show all
          </button>
        </div>
      )}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.4 }}
        >
          <Controls />
          <Background color={gridColor} gap={16} />
        </ReactFlow>
        <GraphLegend />
      </div>
    </div>
  );
}
