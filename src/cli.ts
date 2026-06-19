#!/usr/bin/env node

/**
 * cobasaja CLI — discover and run MCP tests.
 *
 * Usage:
 *   cobasaja                  # Run all tests in cwd
 *   cobasaja --update         # Update snapshots
 *   cobasaja --root ./tests   # Run tests in a specific directory
 *   cobasaja --verbose        # Show detailed test output
 */

import { run } from './runner.js';

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  cobasaja — deterministic MCP testing framework

  Usage:
    cobasaja                    Run all tests in current directory
    cobasaja --update           Update snapshots
    cobasaja --root ./tests     Run tests in a specific directory
    cobasaja --verbose          Show detailed test output
    cobasaja --help             Show this help
  `);
  process.exit(0);
}

const rootIndex = args.indexOf('--root');
const root = rootIndex >= 0 && rootIndex + 1 < args.length
  ? args[rootIndex + 1]
  : process.cwd();

const update = args.includes('--update');
const verbose = args.includes('--verbose');

run({ root, update, verbose }).then(exitCode => {
  process.exit(exitCode);
}).catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
