import { formatDistanceToNow, parseISO } from 'date-fns';

/**
 * Formats an ISO timestamp as a relative time string.
 * @param isoString - ISO 8601 timestamp
 * @returns Human-readable relative time (e.g., "2 hours ago", "yesterday")
 */
export function formatRelativeTime(isoString: string): string {
  try {
    const date = parseISO(isoString);
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return isoString; // Fallback to original if parsing fails
  }
}

/**
 * Formats a timestamp with both relative and absolute time.
 * @param isoString - ISO 8601 timestamp
 * @returns Object with relative and absolute formatted strings
 */
export function formatTimestamp(isoString: string): {
  relative: string;
  absolute: string;
} {
  try {
    const date = parseISO(isoString);
    return {
      relative: formatDistanceToNow(date, { addSuffix: true }),
      absolute: date.toLocaleString(),
    };
  } catch {
    return {
      relative: isoString,
      absolute: isoString,
    };
  }
}
