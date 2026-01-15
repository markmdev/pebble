#!/usr/bin/env node

import { Command } from 'commander';
import { createCommand } from './commands/create.js';
import { updateCommand } from './commands/update.js';
import { closeCommand } from './commands/close.js';
import { reopenCommand } from './commands/reopen.js';
import { claimCommand } from './commands/claim.js';
import { listCommand } from './commands/list.js';
import { showCommand } from './commands/show.js';
import { readyCommand } from './commands/ready.js';
import { blockedCommand } from './commands/blocked.js';
import { depCommand } from './commands/dep.js';
import { commentsCommand } from './commands/comments.js';
import { graphCommand } from './commands/graph.js';
import { uiCommand } from './commands/ui.js';
import { importCommand } from './commands/import.js';
import { mergeCommand } from './commands/merge.js';
import { summaryCommand } from './commands/summary.js';
import { historyCommand } from './commands/history.js';
import { searchCommand } from './commands/search.js';
import { verificationsCommand } from './commands/verifications.js';

const program = new Command();

program
  .name('pebble')
  .description('A lightweight JSONL-based issue tracker')
  .version('0.1.0');

// Global options
program.option('-P, --pretty', 'Human-readable output (default: JSON)');

// Register all commands
createCommand(program);
updateCommand(program);
closeCommand(program);
reopenCommand(program);
claimCommand(program);
listCommand(program);
showCommand(program);
readyCommand(program);
blockedCommand(program);
depCommand(program);
commentsCommand(program);
graphCommand(program);
uiCommand(program);
importCommand(program);
mergeCommand(program);
summaryCommand(program);
historyCommand(program);
searchCommand(program);
verificationsCommand(program);

program.parse();
