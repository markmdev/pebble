/**
 * Get abbreviated path showing last N segments.
 * e.g., '/Users/mark/project/.pebble/issues.jsonl' → '.pebble/issues.jsonl'
 */
export function getAbbreviatedPath(fullPath: string, segments = 2): string {
  const parts = fullPath.split('/').filter(Boolean);
  return parts.slice(-segments).join('/');
}

/**
 * Find the common prefix directory among a list of paths.
 * Returns the longest common directory path.
 */
export function getCommonPrefix(paths: string[]): string {
  if (paths.length === 0) return '';
  if (paths.length === 1) {
    // For single path, return parent directory
    const parts = paths[0].split('/');
    parts.pop(); // Remove filename
    return parts.join('/') + '/';
  }

  // Split all paths into segments
  const splitPaths = paths.map(p => p.split('/'));
  const minLength = Math.min(...splitPaths.map(p => p.length));

  let commonPrefix = '';
  for (let i = 0; i < minLength; i++) {
    const segment = splitPaths[0][i];
    if (splitPaths.every(p => p[i] === segment)) {
      commonPrefix += segment + '/';
    } else {
      break;
    }
  }

  return commonPrefix;
}

/**
 * Get the path relative to a common prefix.
 * If path doesn't start with prefix, returns the full path.
 */
export function getRelativePath(fullPath: string, commonPrefix: string): string {
  if (!commonPrefix || !fullPath.startsWith(commonPrefix)) {
    return fullPath;
  }
  return fullPath.slice(commonPrefix.length);
}
