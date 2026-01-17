import * as fs from 'fs';
import * as path from 'path';
import type { IssueEvent, PebbleConfig } from '../../shared/types.js';
import { derivePrefix } from './id.js';

const PEBBLE_DIR = '.pebble';
const ISSUES_FILE = 'issues.jsonl';
const CONFIG_FILE = 'config.json';

/**
 * Search upward from cwd to find .pebble/ directory
 * Returns the path to .pebble/ or null if not found
 */
export function discoverPebbleDir(startDir: string = process.cwd()): string | null {
  let currentDir = path.resolve(startDir);
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const pebbleDir = path.join(currentDir, PEBBLE_DIR);
    if (fs.existsSync(pebbleDir) && fs.statSync(pebbleDir).isDirectory()) {
      return pebbleDir;
    }
    currentDir = path.dirname(currentDir);
  }

  // Check root as well
  const rootPebble = path.join(root, PEBBLE_DIR);
  if (fs.existsSync(rootPebble) && fs.statSync(rootPebble).isDirectory()) {
    return rootPebble;
  }

  return null;
}

/**
 * Get the .pebble directory, throwing if not found
 */
export function getPebbleDir(): string {
  const dir = discoverPebbleDir();
  if (!dir) {
    throw new Error('No .pebble directory found. Run a create command to initialize.');
  }
  return dir;
}

/**
 * Create .pebble/ directory with config if it doesn't exist
 * Returns the path to .pebble/
 */
export function ensurePebbleDir(baseDir: string = process.cwd()): string {
  const pebbleDir = path.join(baseDir, PEBBLE_DIR);

  if (!fs.existsSync(pebbleDir)) {
    fs.mkdirSync(pebbleDir, { recursive: true });

    // Create initial config
    const folderName = path.basename(baseDir);
    const config: PebbleConfig = {
      prefix: derivePrefix(folderName),
      version: '0.1.0',
    };
    setConfig(config, pebbleDir);

    // Create empty issues file
    const issuesPath = path.join(pebbleDir, ISSUES_FILE);
    fs.writeFileSync(issuesPath, '', 'utf-8');
  }

  return pebbleDir;
}

/**
 * Get the path to the issues JSONL file
 */
export function getIssuesPath(pebbleDir?: string): string {
  const dir = pebbleDir ?? getPebbleDir();
  return path.join(dir, ISSUES_FILE);
}

/**
 * Append an event to the JSONL file
 */
export function appendEvent(event: IssueEvent, pebbleDir?: string): void {
  const issuesPath = getIssuesPath(pebbleDir);
  const line = JSON.stringify(event) + '\n';
  fs.appendFileSync(issuesPath, line, 'utf-8');
}

/**
 * Read all events from a specific JSONL file path
 * Returns empty array if file doesn't exist
 */
export function readEventsFromFile(filePath: string): IssueEvent[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim() !== '');

  return lines.map((line, index) => {
    try {
      return JSON.parse(line) as IssueEvent;
    } catch {
      throw new Error(`Invalid JSON at line ${index + 1} in ${filePath}: ${line}`);
    }
  });
}

/**
 * Read all events from the JSONL file
 * Returns empty array if no .pebble directory exists
 */
export function readEvents(pebbleDir?: string): IssueEvent[] {
  // If no pebbleDir provided, try to discover one
  // Return empty array if no .pebble directory exists (graceful handling for read operations)
  const dir = pebbleDir ?? discoverPebbleDir();
  if (!dir) {
    return [];
  }

  const issuesPath = path.join(dir, ISSUES_FILE);

  if (!fs.existsSync(issuesPath)) {
    return [];
  }

  const content = fs.readFileSync(issuesPath, 'utf-8');
  const lines = content.split('\n').filter((line) => line.trim() !== '');

  return lines.map((line, index) => {
    try {
      return JSON.parse(line) as IssueEvent;
    } catch {
      throw new Error(`Invalid JSON at line ${index + 1}: ${line}`);
    }
  });
}

/**
 * Get the config file path
 */
export function getConfigPath(pebbleDir?: string): string {
  const dir = pebbleDir ?? getPebbleDir();
  return path.join(dir, CONFIG_FILE);
}

/**
 * Read the config file
 */
export function getConfig(pebbleDir?: string): PebbleConfig {
  const configPath = getConfigPath(pebbleDir);

  if (!fs.existsSync(configPath)) {
    throw new Error("No .pebble directory found. Run 'pb init' to initialize.");
  }

  const content = fs.readFileSync(configPath, 'utf-8');
  return JSON.parse(content) as PebbleConfig;
}

/**
 * Write the config file
 */
export function setConfig(config: PebbleConfig, pebbleDir?: string): void {
  const dir = pebbleDir ?? getPebbleDir();
  const configPath = path.join(dir, CONFIG_FILE);
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

/**
 * Get or create the pebble directory
 * If it doesn't exist, creates it in the current directory
 */
export function getOrCreatePebbleDir(): string {
  const existing = discoverPebbleDir();
  if (existing) {
    return existing;
  }
  return ensurePebbleDir();
}
