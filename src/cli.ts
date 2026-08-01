#!/usr/bin/env node

/**
 * cobasaja CLI — discover and run MCP tests.
 *
 * Usage:
 *   cobasaja                  # Run all tests in cwd
 *   cobasaja --update         # Update snapshots
 *   cobasaja --root ./tests   # Run tests in a specific directory
 *   cobasaja --verbose        # Show detailed test output
 *   cobasaja --grep pattern   # Only run matching tests
 *   cobasaja --timeout 5000   # Default per-test timeout (ms)
 *   cobasaja --bail           # Stop after first failure
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
    cobasaja --grep <pattern>   Only run tests matching regex
    cobasaja --timeout <ms>     Default per-test timeout (default: 10000)
    cobasaja --bail             Stop after first failure
    cobasaja --help             Show this help
  `);
  process.exit(0);
}

function flagValue(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  // Support --flag=value
  const prefix = `${flag}=`;
  const eq = args.find((a) => a.startsWith(prefix));
  return eq ? eq.slice(prefix.length) : undefined;
}

const root = flagValue('--root') ?? process.cwd();
const update = args.includes('--update');
const verbose = args.includes('--verbose') || args.includes('-v');
const bail = args.includes('--bail');
const grep = flagValue('--grep') ?? flagValue('-g');
const timeoutRaw = flagValue('--timeout');
const timeout = timeoutRaw != null ? Number(timeoutRaw) : undefined;

if (timeoutRaw != null && (!Number.isFinite(timeout) || (timeout as number) < 0)) {
  console.error(`Fatal: invalid --timeout value "${timeoutRaw}"`);
  process.exit(1);
}

run({ root, update, verbose, bail, filter: grep, timeout }).then(exitCode => {
  process.exit(exitCode);
}).catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
