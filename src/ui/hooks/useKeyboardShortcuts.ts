import { useEffect, useCallback } from 'react';

export interface KeyboardShortcutHandlers {
  /** Called when 'n' is pressed - open create dialog */
  onNewIssue?: () => void;
  /** Called when 'j' is pressed - navigate to next issue */
  onNavigateNext?: () => void;
  /** Called when 'k' is pressed - navigate to previous issue */
  onNavigatePrev?: () => void;
  /** Called when Enter is pressed with an issue selected */
  onOpenDetail?: () => void;
  /** Called when 'c' is pressed - focus comment input */
  onFocusComment?: () => void;
}

/**
 * Check if focus is on an interactive element that should capture keyboard input.
 * Returns true if shortcuts should NOT fire.
 */
function isInputFocused(): boolean {
  const activeElement = document.activeElement;
  if (!activeElement) return false;

  const tagName = activeElement.tagName.toLowerCase();

  // Text inputs, textareas, selects, and contenteditable elements
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true;
  }

  // Check contenteditable
  if (activeElement.getAttribute('contenteditable') === 'true') {
    return true;
  }

  // Check for elements with role that might capture input
  const role = activeElement.getAttribute('role');
  if (role === 'textbox' || role === 'combobox') {
    return true;
  }

  return false;
}

/**
 * Hook for global keyboard shortcuts in the issue tracker UI.
 *
 * Shortcuts:
 * - `n`: Open new issue dialog
 * - `j`: Select next issue (list view)
 * - `k`: Select previous issue (list view)
 * - `Enter`: Open selected issue detail
 * - `c`: Focus comment input (detail panel)
 *
 * All shortcuts are disabled when focus is on an input element.
 * Escape key is handled separately by individual components.
 */
export function useKeyboardShortcuts({
  onNewIssue,
  onNavigateNext,
  onNavigatePrev,
  onOpenDetail,
  onFocusComment,
}: KeyboardShortcutHandlers) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Don't fire shortcuts when typing in inputs
    if (isInputFocused()) return;

    // Don't interfere with modifier key combinations
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    switch (event.key.toLowerCase()) {
      case 'n':
        if (onNewIssue) {
          event.preventDefault();
          onNewIssue();
        }
        break;

      case 'j':
        if (onNavigateNext) {
          event.preventDefault();
          onNavigateNext();
        }
        break;

      case 'k':
        if (onNavigatePrev) {
          event.preventDefault();
          onNavigatePrev();
        }
        break;

      case 'enter':
        if (onOpenDetail) {
          event.preventDefault();
          onOpenDetail();
        }
        break;

      case 'c':
        if (onFocusComment) {
          event.preventDefault();
          onFocusComment();
        }
        break;
    }
  }, [onNewIssue, onNavigateNext, onNavigatePrev, onOpenDetail, onFocusComment]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}
