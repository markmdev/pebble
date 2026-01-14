import * as crypto from 'crypto';

/**
 * Characters used for ID generation (alphanumeric, lowercase)
 */
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generate a random alphanumeric string of specified length
 */
function randomAlphanumeric(length: number): string {
  const bytes = crypto.randomBytes(length);
  let result = '';
  for (let i = 0; i < length; i++) {
    result += ID_CHARS[bytes[i] % ID_CHARS.length];
  }
  return result;
}

/**
 * Generate a unique issue ID
 * Format: PREFIX-xxxxxx (6 char alphanumeric suffix)
 */
export function generateId(prefix: string): string {
  const suffix = randomAlphanumeric(6);
  return `${prefix}-${suffix}`;
}

/**
 * Derive a prefix from a folder name
 * Takes first 4 alphabetic/numeric characters and uppercases them
 * Pads with 'X' if less than 4 characters
 */
export function derivePrefix(folderName: string): string {
  const clean = folderName.replace(/[^a-zA-Z0-9]/g, '');
  return clean.slice(0, 4).toUpperCase().padEnd(4, 'X');
}

/**
 * Check if a string is a valid issue ID format
 */
export function isValidId(id: string): boolean {
  return /^[A-Z]{4}-[a-z0-9]{6}$/.test(id);
}

/**
 * Extract the prefix from an issue ID
 */
export function extractPrefix(id: string): string | null {
  const match = id.match(/^([A-Z]{4})-[a-z0-9]{6}$/);
  return match ? match[1] : null;
}
