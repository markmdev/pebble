import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Select } from './ui/select';
import { Textarea } from './ui/textarea';
import { HierarchicalSelect } from './ui/hierarchical-select';
import { createIssue, fetchSources, type SourcesResponse } from '../lib/api';
import type { Issue, IssueType, Priority } from '../../shared/types';
import { ISSUE_TYPES, PRIORITIES, TYPE_LABELS, PRIORITY_DISPLAY_LABELS } from '../../shared/types';
import { Loader2, FolderSync } from 'lucide-react';

interface CreateIssueFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
  epics: Issue[];
}

export function CreateIssueForm({ open, onOpenChange, onCreated, epics }: CreateIssueFormProps) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<IssueType>('task');
  const [priority, setPriority] = useState<Priority>(2);
  const [description, setDescription] = useState('');
  const [parent, setParent] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Multi-worktree source selection
  const [sources, setSources] = useState<SourcesResponse | null>(null);
  const [targetSource, setTargetSource] = useState<number>(0);

  // Fetch available sources when dialog opens
  useEffect(() => {
    if (open) {
      fetchSources()
        .then(setSources)
        .catch(() => setSources(null));
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Title is required');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Pass target source index in multi-worktree mode
      const targetIndex = sources?.isMultiWorktree ? targetSource : undefined;
      await createIssue({
        title: title.trim(),
        type,
        priority,
        description: description.trim() || undefined,
        parent: parent || undefined,
      }, targetIndex);

      // Reset form
      setTitle('');
      setType('task');
      setPriority(2);
      setDescription('');
      setParent('');
      setTargetSource(0);

      toast.success('Issue created');
      onCreated();
      onOpenChange(false);
    } catch (err) {
      toast.error('Failed to create issue', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      onOpenChange(false);
    }
  };

  // Filter epics that are not closed
  const availableEpics = epics.filter(e => e.status !== 'closed');

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]" onClose={handleClose}>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create New Issue</DialogTitle>
            <DialogDescription>
              Add a new task, bug, or epic to your project.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4 px-6">
            {/* Title */}
            <div className="grid gap-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter issue title"
                disabled={loading}
                autoFocus
              />
            </div>

            {/* Type and Priority row */}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="type">Type</Label>
                <Select
                  id="type"
                  value={type}
                  onChange={(e) => setType(e.target.value as IssueType)}
                  disabled={loading}
                >
                  {ISSUE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="priority">Priority</Label>
                <Select
                  id="priority"
                  value={priority}
                  onChange={(e) => setPriority(Number(e.target.value) as Priority)}
                  disabled={loading}
                >
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {PRIORITY_DISPLAY_LABELS[p]}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {/* Parent (only for non-epics) */}
            {type !== 'epic' && availableEpics.length > 0 && (
              <div className="grid gap-2">
                <Label>Parent Epic</Label>
                <HierarchicalSelect
                  epics={availableEpics}
                  value={parent}
                  onChange={setParent}
                  disabled={loading}
                  placeholder="None"
                />
              </div>
            )}

            {/* Description */}
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Enter issue description (optional)"
                disabled={loading}
                rows={3}
              />
            </div>

            {/* Target File (multi-worktree mode only) */}
            {sources?.isMultiWorktree && sources.files.length > 1 && (
              <div className="grid gap-2">
                <Label htmlFor="targetSource" className="flex items-center gap-1.5">
                  <FolderSync className="h-4 w-4" />
                  Target File
                </Label>
                <Select
                  id="targetSource"
                  value={targetSource}
                  onChange={(e) => setTargetSource(Number(e.target.value))}
                  disabled={loading}
                >
                  {sources.files.map((file, index) => (
                    <option key={index} value={index}>
                      {file}
                    </option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground">
                  Choose which worktree to create the issue in
                </p>
              </div>
            )}

            {/* Error message */}
            {error && (
              <div className="text-sm text-destructive">
                {error}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Issue'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
