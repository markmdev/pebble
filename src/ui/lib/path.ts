/**
 * Get abbreviated path showing last N segments.
 * e.g., '/Users/mark/project/.pebble/issues.jsonl' → '.pebble/issues.jsonl'
 */
export function getAbbreviatedPath(fullPath: string, segments = 2): string {
  const parts = fullPath.split('/').filter(Boolean);
  return parts.slice(-segments).join('/');
}
