import { useEffect, useMemo, useState, type RefObject } from 'react';
import { toast } from 'sonner';
import type { Issue, Status, Priority, IssueEvent } from '../../shared/types';
import {
  STATUS_BADGE_VARIANTS,
  TYPE_BADGE_VARIANTS,
  PRIORITY_DISPLAY_LABELS,
  STATUSES,
  PRIORITIES,
  STATUS_LABELS,
} from '../../shared/types';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { Textarea } from './ui/textarea';
import { Label } from './ui/label';
import { IssueSelector } from './ui/issue-selector';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from './ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from './ui/alert-dialog';
import {
  X,
  Clock,
  MessageSquare,
  GitBranch,
  Pencil,
  Check,
  XCircle,
  Loader2,
  Plus,
  RotateCcw,
  ChevronDown,
  ChevronRight,
  Activity,
} from 'lucide-react';
import { EventTimeline } from './EventTimeline';
import { formatRelativeTime } from '../lib/time';
import { sortByStatus, sortByDependencies } from '../lib/sort';
import {
  updateIssue,
  closeIssue,
  reopenIssue,
  addComment,
  addDependency,
  removeDependency,
} from '../lib/api';

interface IssueDetailProps {
  issue: Issue;
  allIssues: Issue[];
  events: IssueEvent[];
  onClose: () => void;
  onSelectIssue: (issue: Issue) => void;
  onFocusGraph?: (issueId: string) => void;
  onRefresh?: () => void;
  commentInputRef?: RefObject<HTMLTextAreaElement>;
}

export function IssueDetail({
  issue,
  allIssues,
  events,
  onClose,
  onSelectIssue,
  onFocusGraph,
  onRefresh,
  commentInputRef,
}: IssueDetailProps) {
  // Create lookup map for O(1) issue access
  const issueMap = useMemo(
    () => new Map(allIssues.map((i) => [i.id, i])),
    [allIssues]
  );

  // Editing states
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(issue.title);
  const [editingDescription, setEditingDescription] = useState(false);
  const [descriptionValue, setDescriptionValue] = useState(issue.description || '');
  const [newComment, setNewComment] = useState('');
  const [blockerDialogOpen, setBlockerDialogOpen] = useState(false);
  const [selectedBlocker, setSelectedBlocker] = useState('');

  // Loading states
  const [savingTitle, setSavingTitle] = useState(false);
  const [savingDescription, setSavingDescription] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [savingPriority, setSavingPriority] = useState(false);
  const [savingComment, setSavingComment] = useState(false);
  const [savingBlocker, setSavingBlocker] = useState(false);
  const [closingIssue, setClosingIssue] = useState(false);

  // Confirmation dialog states
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [removeBlockerConfirmOpen, setRemoveBlockerConfirmOpen] = useState(false);
  const [blockerToRemove, setBlockerToRemove] = useState<string | null>(null);

  // Activity section state (for epics)
  const [activityExpanded, setActivityExpanded] = useState(false);

  // Get child IDs for activity filtering
  const childIds = useMemo(() => {
    return allIssues.filter((i) => i.parent === issue.id).map((i) => i.id);
  }, [allIssues, issue.id]);

  // Reset values when issue changes
  useEffect(() => {
    setTitleValue(issue.title);
    setDescriptionValue(issue.description || '');
    setEditingTitle(false);
    setEditingDescription(false);
  }, [issue.id, issue.title, issue.description]);

  // BlockedBy: sorted by dependencies (blockers' blockers first)
  const blockedByIssues = useMemo(() => {
    const blockers = issue.blockedBy
      .map((id) => issueMap.get(id))
      .filter((i): i is Issue => i !== undefined);
    return sortByDependencies(blockers);
  }, [issue.blockedBy, issueMap]);

  // Blocking: sorted by dependencies
  const blockingIssues = useMemo(() => {
    const blocked = allIssues.filter((i) => i.blockedBy.includes(issue.id));
    return sortByDependencies(blocked);
  }, [allIssues, issue.id]);

  // Children: sorted by status (open/in_progress first, closed at bottom)
  const childIssues = useMemo(() => {
    const children = allIssues.filter((i) => i.parent === issue.id);
    return sortByStatus(children);
  }, [allIssues, issue.id]);

  // Available issues for blocker selection (not self, not already blocking)
  const availableBlockers = useMemo(() => {
    return allIssues.filter(
      (i) => i.id !== issue.id && !issue.blockedBy.includes(i.id) && i.status !== 'closed'
    );
  }, [allIssues, issue.id, issue.blockedBy]);

  const parentIssue = issue.parent ? issueMap.get(issue.parent) : undefined;

  // Close panel on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !editingTitle && !editingDescription && !blockerDialogOpen) {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose, editingTitle, editingDescription, blockerDialogOpen]);

  // Handlers
  const handleSaveTitle = async () => {
    if (!titleValue.trim() || titleValue === issue.title) {
      setEditingTitle(false);
      setTitleValue(issue.title);
      return;
    }
    setSavingTitle(true);
    try {
      await updateIssue(issue.id, { title: titleValue.trim() });
      setEditingTitle(false);
      toast.success('Title updated');
      onRefresh?.();
    } catch (err) {
      toast.error('Failed to save title', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSavingTitle(false);
    }
  };

  const handleSaveDescription = async () => {
    if (descriptionValue === (issue.description || '')) {
      setEditingDescription(false);
      return;
    }
    setSavingDescription(true);
    try {
      await updateIssue(issue.id, { description: descriptionValue.trim() || undefined });
      setEditingDescription(false);
      toast.success('Description updated');
      onRefresh?.();
    } catch (err) {
      toast.error('Failed to save description', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSavingDescription(false);
    }
  };

  const handleStatusChange = async (newStatus: Status) => {
    if (newStatus === issue.status) return;
    setSavingStatus(true);
    try {
      await updateIssue(issue.id, { status: newStatus });
      toast.success('Status updated');
      onRefresh?.();
    } catch (err) {
      toast.error('Failed to update status', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSavingStatus(false);
    }
  };

  const handlePriorityChange = async (newPriority: Priority) => {
    if (newPriority === issue.priority) return;
    setSavingPriority(true);
    try {
      await updateIssue(issue.id, { priority: newPriority });
      toast.success('Priority updated');
      onRefresh?.();
    } catch (err) {
      toast.error('Failed to update priority', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSavingPriority(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    setSavingComment(true);
    try {
      await addComment(issue.id, newComment.trim());
      setNewComment('');
      toast.success('Comment added');
      onRefresh?.();
    } catch (err) {
      toast.error('Failed to add comment', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSavingComment(false);
    }
  };

  const handleCloseIssue = async () => {
    setClosingIssue(true);
    setCloseConfirmOpen(false);
    try {
      await closeIssue(issue.id);
      toast('Issue closed', {
        duration: 5000,
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              await reopenIssue(issue.id);
              toast.success('Issue reopened');
              onRefresh?.();
            } catch {
              toast.error('Failed to undo');
            }
          },
        },
      });
      onRefresh?.();
    } catch (err) {
      toast.error('Failed to close issue', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setClosingIssue(false);
    }
  };

  const handleReopenIssue = async () => {
    setClosingIssue(true);
    try {
      await reopenIssue(issue.id);
      toast.success('Issue reopened');
      onRefresh?.();
    } catch (err) {
      toast.error('Failed to reopen issue', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setClosingIssue(false);
    }
  };

  const handleAddBlocker = async () => {
    if (!selectedBlocker) return;
    setSavingBlocker(true);
    try {
      await addDependency(issue.id, selectedBlocker);
      setBlockerDialogOpen(false);
      setSelectedBlocker('');
      toast.success('Blocker added');
      onRefresh?.();
    } catch (err) {
      toast.error('Failed to add blocker', {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSavingBlocker(false);
    }
  };

  const handleRemoveBlocker = async (blockerId: string) => {
    setRemoveBlockerConfirmOpen(false);
    setBlockerToRemove(null);
    try {
      await removeDependency(issue.id, blockerId);
      toast('Blocker removed', {
        duration: 5000,
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              await addDependency(issue.id, blockerId);
              toast.success('Blocker restored');
              onRefresh?.();
            } catch {
              toast.error('Failed to undo');
            }
          },
        },
      });
      onRefresh?.();
    } catch (err) {
      toast.error('Failed to remove blocker', {
        description: err instanceof Error ? err.message : undefined,
      });
    }
  };

  return (
    <div className="fixed top-[65px] bottom-0 right-0 w-[500px] bg-background border-l shadow-lg overflow-y-auto">
      <div className="sticky top-0 bg-background border-b p-4 z-10">
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-sm text-muted-foreground">{issue.id}</span>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Editable title */}
        <div className="flex items-center gap-2">
          {editingTitle ? (
            <div className="flex-1 flex items-center gap-2">
              <Input
                value={titleValue}
                onChange={(e) => setTitleValue(e.target.value)}
                className="flex-1"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveTitle();
                  if (e.key === 'Escape') {
                    setEditingTitle(false);
                    setTitleValue(issue.title);
                  }
                }}
              />
              <Button
                size="icon"
                variant="ghost"
                onClick={handleSaveTitle}
                disabled={savingTitle}
              >
                {savingTitle ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
              </Button>
              <Button
                size="icon"
                variant="ghost"
                onClick={() => {
                  setEditingTitle(false);
                  setTitleValue(issue.title);
                }}
              >
                <XCircle className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <>
              <h2
                className="text-lg font-semibold flex-1 cursor-pointer hover:bg-muted rounded px-1 -mx-1"
                onClick={() => setEditingTitle(true)}
                title="Click to edit"
              >
                {issue.title}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setEditingTitle(true)}
                title="Edit title"
              >
                <Pencil className="h-4 w-4" />
              </Button>
            </>
          )}
          {onFocusGraph && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFocusGraph(issue.id)}
              title="View in graph"
            >
              <GitBranch className="h-4 w-4 mr-1" />
              Graph
            </Button>
          )}
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Status and Priority dropdowns */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Status</Label>
            <Select
              value={issue.status}
              onChange={(e) => handleStatusChange(e.target.value as Status)}
              disabled={savingStatus || issue.status === 'closed'}
            >
              {STATUSES.filter((s) => s !== 'closed').map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Priority</Label>
            <Select
              value={issue.priority}
              onChange={(e) => handlePriorityChange(Number(e.target.value) as Priority)}
              disabled={savingPriority}
            >
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_DISPLAY_LABELS[p]}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Type badge (read-only) */}
        <div className="flex items-center gap-2">
          <Badge variant={TYPE_BADGE_VARIANTS[issue.type]}>{issue.type}</Badge>
          <Badge variant={STATUS_BADGE_VARIANTS[issue.status]}>
            {issue.status.replace('_', ' ')}
          </Badge>
        </div>

        {/* Close/Reopen buttons */}
        <div className="flex gap-2">
          {issue.status === 'closed' ? (
            <Button
              variant="outline"
              onClick={handleReopenIssue}
              disabled={closingIssue}
            >
              {closingIssue ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RotateCcw className="h-4 w-4 mr-2" />
              )}
              Reopen Issue
            </Button>
          ) : (
            <Button
              variant="destructive"
              onClick={() => setCloseConfirmOpen(true)}
              disabled={closingIssue}
            >
              {closingIssue ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <XCircle className="h-4 w-4 mr-2" />
              )}
              Close Issue
            </Button>
          )}
        </div>

        {/* Description */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Description</h3>
            {!editingDescription && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingDescription(true)}
              >
                <Pencil className="h-3 w-3 mr-1" />
                Edit
              </Button>
            )}
          </div>
          {editingDescription ? (
            <div className="space-y-2">
              <Textarea
                value={descriptionValue}
                onChange={(e) => setDescriptionValue(e.target.value)}
                rows={4}
                placeholder="Enter description..."
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleSaveDescription}
                  disabled={savingDescription}
                >
                  {savingDescription ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4 mr-1" />
                  )}
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setEditingDescription(false);
                    setDescriptionValue(issue.description || '');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap min-h-[40px]">
              {issue.description || 'No description.'}
            </p>
          )}
        </div>

        {/* Parent */}
        {parentIssue && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Parent Epic</h3>
            <button
              className="text-sm text-primary hover:underline flex items-center gap-1"
              onClick={() => onSelectIssue(parentIssue)}
            >
              <span className="font-mono">{parentIssue.id}</span>
              <span>— {parentIssue.title}</span>
            </button>
          </div>
        )}

        {/* Children */}
        {childIssues.length > 0 && (
          <div className="space-y-2">
            {(() => {
              const closedCount = childIssues.filter((c) => c.status === 'closed').length;
              const total = childIssues.length;
              const percent = Math.round((closedCount / total) * 100);
              return (
                <>
                  <h3 className="text-sm font-medium flex items-center gap-1">
                    <GitBranch className="h-4 w-4" />
                    Child Issues ({closedCount}/{total} done)
                  </h3>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full transition-all ${
                        percent === 100 ? 'bg-green-500' : 'bg-purple-500'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </>
              );
            })()}
            <div className="space-y-1">
              {childIssues.map((child) => (
                <button
                  key={child.id}
                  className="block w-full text-left text-sm hover:bg-muted rounded p-2"
                  onClick={() => onSelectIssue(child)}
                >
                  <span className="font-mono text-xs">{child.id}</span>
                  <span className="mx-2">—</span>
                  <span>{child.title}</span>
                  <Badge
                    variant={STATUS_BADGE_VARIANTS[child.status]}
                    className="ml-2 text-xs"
                  >
                    {child.status.replace('_', ' ')}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Activity section - for all issues */}
        <div className="space-y-2">
          <button
            className="flex items-center gap-2 text-sm font-medium w-full"
            onClick={() => setActivityExpanded(!activityExpanded)}
          >
            {activityExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <Activity className="h-4 w-4" />
            {issue.type === 'epic' && childIds.length > 0 ? 'Children Activity' : 'Activity'}
          </button>
          {activityExpanded && (
            <div className="pl-6">
              <EventTimeline
                events={events}
                issues={allIssues}
                onSelectIssue={onSelectIssue}
                issueIds={issue.type === 'epic' && childIds.length > 0 ? childIds : [issue.id]}
                showFilters={false}
                maxEvents={10}
              />
            </div>
          )}
        </div>

        {/* Dependencies */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-destructive">
              Blocked By ({blockedByIssues.length})
            </h3>
            {availableBlockers.length > 0 && issue.status !== 'closed' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setBlockerDialogOpen(true)}
              >
                <Plus className="h-3 w-3 mr-1" />
                Add Blocker
              </Button>
            )}
          </div>
          {blockedByIssues.length > 0 ? (
            <div className="space-y-1">
              {blockedByIssues.map((blocker) => (
                <div
                  key={blocker.id}
                  className="flex items-center justify-between hover:bg-muted rounded p-2"
                >
                  <button
                    className="flex-1 text-left text-sm"
                    onClick={() => onSelectIssue(blocker)}
                  >
                    <span className="font-mono text-xs">{blocker.id}</span>
                    <span className="mx-2">—</span>
                    <span>{blocker.title}</span>
                    <Badge
                      variant={STATUS_BADGE_VARIANTS[blocker.status]}
                      className="ml-2 text-xs"
                    >
                      {blocker.status.replace('_', ' ')}
                    </Badge>
                  </button>
                  {issue.status !== 'closed' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setBlockerToRemove(blocker.id);
                        setRemoveBlockerConfirmOpen(true);
                      }}
                      title="Remove blocker"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No blockers.</p>
          )}
        </div>

        {blockingIssues.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium text-primary">
              Blocking ({blockingIssues.length})
            </h3>
            <div className="space-y-1">
              {blockingIssues.map((blocked) => (
                <button
                  key={blocked.id}
                  className="block w-full text-left text-sm hover:bg-muted rounded p-2"
                  onClick={() => onSelectIssue(blocked)}
                >
                  <span className="font-mono text-xs">{blocked.id}</span>
                  <span className="mx-2">—</span>
                  <span>{blocked.title}</span>
                  <Badge
                    variant={STATUS_BADGE_VARIANTS[blocked.status]}
                    className="ml-2 text-xs"
                  >
                    {blocked.status.replace('_', ' ')}
                  </Badge>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Comments */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium flex items-center gap-1">
            <MessageSquare className="h-4 w-4" />
            Comments ({issue.comments.length})
          </h3>
          {issue.comments.length > 0 && (
            <div className="space-y-3">
              {[...issue.comments]
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                .map((comment, index) => (
                <div
                  key={`${comment.timestamp}-${index}`}
                  className="bg-muted rounded-lg p-3 text-sm space-y-1"
                >
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Clock className="h-3 w-3" />
                    <span title={new Date(comment.timestamp).toLocaleString()}>
                      {formatRelativeTime(comment.timestamp)}
                    </span>
                    {comment.author && <span>by {comment.author}</span>}
                  </div>
                  <p className="whitespace-pre-wrap">{comment.text}</p>
                </div>
              ))}
            </div>
          )}

          {/* Add comment form */}
          <div className="space-y-2 pt-2">
            <Textarea
              ref={commentInputRef}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Add a comment..."
              rows={2}
            />
            <Button
              size="sm"
              onClick={handleAddComment}
              disabled={savingComment || !newComment.trim()}
              title="Add Comment (c)"
            >
              {savingComment ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-1" />
              )}
              Add Comment
            </Button>
          </div>
        </div>

        {/* Timestamps */}
        <div className="space-y-2 text-xs text-muted-foreground border-t pt-4">
          <div className="flex items-center gap-2">
            <span>Created:</span>
            <span title={new Date(issue.createdAt).toLocaleString()}>
              {formatRelativeTime(issue.createdAt)}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span>Updated:</span>
            <span title={new Date(issue.updatedAt).toLocaleString()}>
              {formatRelativeTime(issue.updatedAt)}
            </span>
          </div>
        </div>
      </div>

      {/* Add blocker dialog */}
      <Dialog open={blockerDialogOpen} onOpenChange={setBlockerDialogOpen}>
        <DialogContent onClose={() => setBlockerDialogOpen(false)}>
          <DialogHeader>
            <DialogTitle>Add Blocker</DialogTitle>
          </DialogHeader>
          <div className="py-4 px-6">
            <Label>Select issue that blocks this one</Label>
            <div className="mt-2">
              <IssueSelector
                issues={allIssues}
                value={selectedBlocker}
                onChange={setSelectedBlocker}
                excludeIds={[issue.id, ...issue.blockedBy]}
                placeholder="Search for an issue..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setBlockerDialogOpen(false);
                setSelectedBlocker('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddBlocker}
              disabled={!selectedBlocker || savingBlocker}
            >
              {savingBlocker ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-1" />
              )}
              Add Blocker
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Close issue confirmation dialog */}
      <AlertDialog open={closeConfirmOpen} onOpenChange={setCloseConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close Issue</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to close this issue? You can reopen it later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCloseConfirmOpen(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleCloseIssue}>
              Close Issue
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Remove blocker confirmation dialog */}
      <AlertDialog open={removeBlockerConfirmOpen} onOpenChange={setRemoveBlockerConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Blocker</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {blockerToRemove} as a blocker for this issue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
              setRemoveBlockerConfirmOpen(false);
              setBlockerToRemove(null);
            }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => blockerToRemove && handleRemoveBlocker(blockerToRemove)}>
              Remove Blocker
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
