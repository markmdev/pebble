import { useMemo } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { EventTimeline } from './EventTimeline';
import type { Issue, IssueEvent, Status, IssueType, Priority } from '../../shared/types';
import { useTheme } from '../contexts/ThemeContext';
import { getCommonPrefix, getRelativePath } from '../lib/path';

interface DashboardProps {
  issues: Issue[];
  events: IssueEvent[];
  onSelectIssue: (issue: Issue) => void;
  onFilterByStatus?: (status: Status) => void;
}

// Status colors matching the graph colors
const STATUS_COLORS: Record<Status, string> = {
  open: '#f59e0b', // amber
  in_progress: '#3b82f6', // blue
  blocked: '#ef4444', // red
  closed: '#22c55e', // green
};

// Type colors
const TYPE_COLORS: Record<IssueType, string> = {
  task: '#3b82f6', // blue
  bug: '#ef4444', // red
  epic: '#8b5cf6', // purple
  verification: '#06b6d4', // cyan
};

// Priority colors (gradient from red to gray)
const PRIORITY_COLORS: Record<Priority, string> = {
  0: '#ef4444', // critical - red
  1: '#f97316', // high - orange
  2: '#eab308', // medium - yellow
  3: '#22c55e', // low - green
  4: '#6b7280', // backlog - gray
};

const PRIORITY_LABELS: Record<Priority, string> = {
  0: 'P0 - Critical',
  1: 'P1 - High',
  2: 'P2 - Medium',
  3: 'P3 - Low',
  4: 'P4 - Backlog',
};

export function Dashboard({ issues, events, onSelectIssue, onFilterByStatus }: DashboardProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  // Chart theming
  const chartColors = {
    grid: isDark ? '#374151' : '#e5e7eb',
    text: isDark ? '#9ca3af' : '#6b7280',
    tooltipBg: isDark ? '#1f2937' : '#ffffff',
    tooltipBorder: isDark ? '#374151' : '#e5e7eb',
  };

  // Compute metrics
  const metrics = useMemo(() => {
    const counts = { open: 0, in_progress: 0, blocked: 0, closed: 0 };
    for (const issue of issues) {
      counts[issue.status]++;
    }
    return counts;
  }, [issues]);

  // Activity data over time (last 30 days)
  const activityData = useMemo(() => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now);
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // Group events by date
    const byDate = new Map<string, { create: number; update: number; close: number; comment: number }>();

    // Initialize all dates in range
    for (let d = new Date(thirtyDaysAgo); d <= now; d.setDate(d.getDate() + 1)) {
      const dateStr = d.toISOString().split('T')[0];
      byDate.set(dateStr, { create: 0, update: 0, close: 0, comment: 0 });
    }

    // Count events
    for (const event of events) {
      const eventDate = new Date(event.timestamp);
      if (eventDate >= thirtyDaysAgo && eventDate <= now) {
        const dateStr = eventDate.toISOString().split('T')[0];
        const entry = byDate.get(dateStr);
        if (entry) {
          if (event.type === 'create') entry.create++;
          else if (event.type === 'update') entry.update++;
          else if (event.type === 'close') entry.close++;
          else if (event.type === 'comment') entry.comment++;
        }
      }
    }

    // Convert to array for chart
    return Array.from(byDate.entries())
      .map(([date, counts]) => ({
        date: new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        ...counts,
      }))
      .slice(-14); // Show last 14 days for readability
  }, [events]);

  // Type distribution data
  const typeData = useMemo(() => {
    const counts: Record<IssueType, number> = { task: 0, bug: 0, epic: 0, verification: 0 };
    for (const issue of issues) {
      counts[issue.type]++;
    }
    return [
      { name: 'Task', value: counts.task },
      { name: 'Bug', value: counts.bug },
      { name: 'Epic', value: counts.epic },
      { name: 'Verification', value: counts.verification },
    ].filter((d) => d.value > 0);
  }, [issues]);

  // Priority distribution data (horizontal bar)
  const priorityData = useMemo(() => {
    const counts: Record<Priority, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 };
    for (const issue of issues) {
      counts[issue.priority]++;
    }
    return ([0, 1, 2, 3, 4] as Priority[]).map((p) => ({
      name: PRIORITY_LABELS[p],
      count: counts[p],
      priority: p,
    }));
  }, [issues]);

  // Status breakdown by type (stacked bar)
  const statusByTypeData = useMemo(() => {
    const data: Record<IssueType, Record<Status, number>> = {
      task: { open: 0, in_progress: 0, blocked: 0, closed: 0 },
      bug: { open: 0, in_progress: 0, blocked: 0, closed: 0 },
      epic: { open: 0, in_progress: 0, blocked: 0, closed: 0 },
      verification: { open: 0, in_progress: 0, blocked: 0, closed: 0 },
    };
    for (const issue of issues) {
      data[issue.type][issue.status]++;
    }
    return [
      { name: 'Task', ...data.task },
      { name: 'Bug', ...data.bug },
      { name: 'Epic', ...data.epic },
      { name: 'Verification', ...data.verification },
    ];
  }, [issues]);

  // Source distribution data (for multi-worktree mode)
  const sourceData = useMemo(() => {
    // Compute common prefix for all source paths
    const allSources: string[] = [];
    for (const issue of issues) {
      if (issue._sources) {
        allSources.push(...issue._sources);
      }
    }
    const sourcePathPrefix = getCommonPrefix(allSources);

    // Count issues by primary source
    const counts = new Map<string, number>();
    for (const issue of issues) {
      const source = issue._sources?.[0];
      if (source) {
        counts.set(source, (counts.get(source) || 0) + 1);
      }
    }

    // Convert to array with relative paths for display
    return Array.from(counts.entries())
      .map(([source, count]) => ({
        source,
        name: getRelativePath(source, sourcePathPrefix),
        count,
      }))
      .sort((a, b) => b.count - a.count); // Sort by count descending
  }, [issues]);

  const handleMetricClick = (status: Status) => {
    if (onFilterByStatus) {
      onFilterByStatus(status);
    }
  };

  return (
    <div className="space-y-6">
      {/* Metrics Row */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          label="Open"
          value={metrics.open}
          color={STATUS_COLORS.open}
          onClick={() => handleMetricClick('open')}
        />
        <MetricCard
          label="In Progress"
          value={metrics.in_progress}
          color={STATUS_COLORS.in_progress}
          onClick={() => handleMetricClick('in_progress')}
        />
        <MetricCard
          label="Blocked"
          value={metrics.blocked}
          color={STATUS_COLORS.blocked}
          onClick={() => handleMetricClick('blocked')}
        />
        <MetricCard
          label="Closed"
          value={metrics.closed}
          color={STATUS_COLORS.closed}
          onClick={() => handleMetricClick('closed')}
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-2 gap-4">
        {/* Activity Over Time */}
        <div className="bg-card border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-4">Activity Over Time</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activityData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: chartColors.text, fontSize: 11 }}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: chartColors.text, fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartColors.tooltipBg,
                    border: `1px solid ${chartColors.tooltipBorder}`,
                    borderRadius: '6px',
                  }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="create"
                  stackId="1"
                  stroke="#22c55e"
                  fill="#22c55e"
                  fillOpacity={0.6}
                  name="Created"
                />
                <Area
                  type="monotone"
                  dataKey="update"
                  stackId="1"
                  stroke="#3b82f6"
                  fill="#3b82f6"
                  fillOpacity={0.6}
                  name="Updated"
                />
                <Area
                  type="monotone"
                  dataKey="close"
                  stackId="1"
                  stroke="#8b5cf6"
                  fill="#8b5cf6"
                  fillOpacity={0.6}
                  name="Closed"
                />
                <Area
                  type="monotone"
                  dataKey="comment"
                  stackId="1"
                  stroke="#f59e0b"
                  fill="#f59e0b"
                  fillOpacity={0.6}
                  name="Comments"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Type Distribution */}
        <div className="bg-card border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-4">Issues by Type</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={typeData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {typeData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={TYPE_COLORS[entry.name.toLowerCase() as IssueType] || '#6b7280'}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartColors.tooltipBg,
                    border: `1px solid ${chartColors.tooltipBorder}`,
                    borderRadius: '6px',
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-2 gap-4">
        {/* Priority Distribution */}
        <div className="bg-card border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-4">Priority Distribution</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={priorityData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} horizontal={false} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: chartColors.text, fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: chartColors.text, fontSize: 11 }}
                  width={100}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartColors.tooltipBg,
                    border: `1px solid ${chartColors.tooltipBorder}`,
                    borderRadius: '6px',
                  }}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {priorityData.map((entry) => (
                    <Cell key={entry.name} fill={PRIORITY_COLORS[entry.priority]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Status by Type */}
        <div className="bg-card border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-4">Status by Type</h3>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusByTypeData}>
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} vertical={false} />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: chartColors.text, fontSize: 11 }}
                />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: chartColors.text, fontSize: 11 }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartColors.tooltipBg,
                    border: `1px solid ${chartColors.tooltipBorder}`,
                    borderRadius: '6px',
                  }}
                />
                <Legend />
                <Bar dataKey="open" stackId="status" fill={STATUS_COLORS.open} name="Open" />
                <Bar dataKey="in_progress" stackId="status" fill={STATUS_COLORS.in_progress} name="In Progress" />
                <Bar dataKey="blocked" stackId="status" fill={STATUS_COLORS.blocked} name="Blocked" />
                <Bar dataKey="closed" stackId="status" fill={STATUS_COLORS.closed} name="Closed" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Issues by Source (only show when multiple sources) */}
      {sourceData.length > 1 && (
        <div className="bg-card border rounded-lg p-4">
          <h3 className="text-sm font-medium mb-4">Issues by Source</h3>
          <div className="h-[200px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sourceData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke={chartColors.grid} horizontal={false} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: chartColors.text, fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: chartColors.text, fontSize: 11 }}
                  width={200}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: chartColors.tooltipBg,
                    border: `1px solid ${chartColors.tooltipBorder}`,
                    borderRadius: '6px',
                  }}
                  formatter={(value: number) => [value, 'Issues']}
                />
                <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Live Activity Feed */}
      <div className="bg-card border rounded-lg p-4">
        <h3 className="text-sm font-medium mb-4">Recent Activity</h3>
        <EventTimeline
          events={events}
          issues={issues}
          onSelectIssue={onSelectIssue}
          showFilters={false}
          maxEvents={15}
        />
      </div>
    </div>
  );
}

// Metric card component
interface MetricCardProps {
  label: string;
  value: number;
  color: string;
  onClick?: () => void;
}

function MetricCard({ label, value, color, onClick }: MetricCardProps) {
  return (
    <button
      onClick={onClick}
      className="bg-card border rounded-lg p-4 text-left hover:bg-muted transition-colors cursor-pointer"
      style={{ borderLeftColor: color, borderLeftWidth: '4px' }}
    >
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-3xl font-bold mt-1">{value}</div>
    </button>
  );
}
