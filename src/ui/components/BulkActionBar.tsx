import { useState } from 'react';
import { toast } from 'sonner';
import { X, CheckCircle, ArrowRight } from 'lucide-react';
import { Button } from './ui/button';
import { Select } from './ui/select';
import { bulkCloseIssues, bulkUpdateIssues } from '../lib/api';
import type { Status, Priority } from '../../shared/types';
import { STATUS_LABELS, PRIORITY_DISPLAY_LABELS } from '../../shared/types';

interface BulkActionBarProps {
  selectedIds: Set<string>;
  onClearSelection: () => void;
  onRefresh: () => void;
}

export function BulkActionBar({
  selectedIds,
  onClearSelection,
  onRefresh,
}: BulkActionBarProps) {
  const [loading, setLoading] = useState(false);
  const [statusValue, setStatusValue] = useState<Status | ''>('');
  const [priorityValue, setPriorityValue] = useState<Priority | ''>('');

  const count = selectedIds.size;
  const ids = Array.from(selectedIds);

  if (count === 0) return null;

  const handleCloseAll = async () => {
    setLoading(true);
    try {
      const result = await bulkCloseIssues(ids);
      const succeeded = result.results.filter((r) => r.success).length;
      const failed = result.results.filter((r) => !r.success);

      if (failed.length === 0) {
        toast.success(`Closed ${succeeded} issue${succeeded !== 1 ? 's' : ''}`);
      } else {
        toast.warning(
          `Closed ${succeeded} issue${succeeded !== 1 ? 's' : ''}, ${failed.length} failed`,
          {
            description: failed.map((f) => `${f.id}: ${f.error}`).join(', '),
          }
        );
      }
      onClearSelection();
      onRefresh();
    } catch (err) {
      toast.error('Failed to close issues', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSetStatus = async () => {
    if (!statusValue) return;
    setLoading(true);
    try {
      const result = await bulkUpdateIssues(ids, { status: statusValue });
      const succeeded = result.results.filter((r) => r.success).length;
      const failed = result.results.filter((r) => !r.success);

      if (failed.length === 0) {
        toast.success(
          `Set ${succeeded} issue${succeeded !== 1 ? 's' : ''} to ${STATUS_LABELS[statusValue]}`
        );
      } else {
        toast.warning(
          `Updated ${succeeded} issue${succeeded !== 1 ? 's' : ''}, ${failed.length} failed`,
          {
            description: failed.map((f) => `${f.id}: ${f.error}`).join(', '),
          }
        );
      }
      setStatusValue('');
      onClearSelection();
      onRefresh();
    } catch (err) {
      toast.error('Failed to update status', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSetPriority = async () => {
    if (priorityValue === '') return;
    setLoading(true);
    try {
      const result = await bulkUpdateIssues(ids, { priority: priorityValue });
      const succeeded = result.results.filter((r) => r.success).length;
      const failed = result.results.filter((r) => !r.success);

      if (failed.length === 0) {
        toast.success(
          `Set ${succeeded} issue${succeeded !== 1 ? 's' : ''} to ${PRIORITY_DISPLAY_LABELS[priorityValue]} priority`
        );
      } else {
        toast.warning(
          `Updated ${succeeded} issue${succeeded !== 1 ? 's' : ''}, ${failed.length} failed`,
          {
            description: failed.map((f) => `${f.id}: ${f.error}`).join(', '),
          }
        );
      }
      setPriorityValue('');
      onClearSelection();
      onRefresh();
    } catch (err) {
      toast.error('Failed to update priority', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-4 p-3 mb-4 bg-muted/50 border rounded-lg">
      {/* Selection count */}
      <div className="flex items-center gap-2">
        <span className="font-medium text-sm">
          {count} selected
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClearSelection}
          className="h-6 w-6 p-0"
          title="Clear selection"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="h-6 w-px bg-border" />

      {/* Close All */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleCloseAll}
        disabled={loading}
      >
        <CheckCircle className="h-4 w-4 mr-1" />
        Close All
      </Button>

      <div className="h-6 w-px bg-border" />

      {/* Set Status */}
      <div className="flex items-center gap-2">
        <Select
          value={statusValue}
          onChange={(e) => setStatusValue(e.target.value as Status | '')}
          className="h-8 w-[140px] text-sm"
          disabled={loading}
        >
          <option value="">Set Status...</option>
          <option value="open">Open</option>
          <option value="in_progress">In Progress</option>
          <option value="blocked">Blocked</option>
        </Select>
        {statusValue && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleSetStatus}
            disabled={loading}
            className="h-8"
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Set Priority */}
      <div className="flex items-center gap-2">
        <Select
          value={priorityValue === '' ? '' : String(priorityValue)}
          onChange={(e) =>
            setPriorityValue(e.target.value === '' ? '' : (Number(e.target.value) as Priority))
          }
          className="h-8 w-[140px] text-sm"
          disabled={loading}
        >
          <option value="">Set Priority...</option>
          <option value="0">Critical</option>
          <option value="1">High</option>
          <option value="2">Medium</option>
          <option value="3">Low</option>
          <option value="4">Backlog</option>
        </Select>
        {priorityValue !== '' && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleSetPriority}
            disabled={loading}
            className="h-8"
          >
            <ArrowRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
