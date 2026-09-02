#!/usr/bin/env node

/**
 * cobasaja CLI — discover and run MCP tests.
 *
 * Usage:
 *   cobasaja                  # Run all tests in cwd
 *   cobasaja tests/foo.test.ts
 *   cobasaja --update         # Update snapshots
 *   cobasaja --root ./tests   # Run tests in a specific directory
 *   cobasaja --verbose        # Show detailed test output
 *   cobasaja --grep pattern   # Only run matching tests
 *   cobasaja --timeout 5000   # Default per-test timeout (ms)
 *   cobasaja --bail           # Stop after first failure
 *   cobasaja --reporter json  # Machine-readable report
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './runner.js';

const HELP = `
  cobasaja — deterministic MCP testing framework

  Usage:
    cobasaja [files...]         Run given files/dirs, or discover tests in cwd
    cobasaja --update           Update snapshots
    cobasaja --root ./tests     Run tests in a specific directory
    cobasaja --verbose          Show detailed test output
    cobasaja --grep <pattern>   Only run tests matching regex
    cobasaja --timeout <ms>     Default per-test timeout (default: 10000)
    cobasaja --bail             Stop after first failure
    cobasaja --reporter <name>  spec (default) or json
    cobasaja --version          Print version
    cobasaja --help             Show this help
`;

const VALUE_FLAGS = new Set(['--root', '--grep', '-g', '--timeout', '--reporter']);

function parseArgv(argv: string[]): { flags: string[]; files: string[] } {
  const flags: string[] = [];
  const files: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      files.push(...argv.slice(i + 1));
      break;
    }
    if (VALUE_FLAGS.has(arg)) {
      flags.push(arg);
      if (i + 1 < argv.length) flags.push(argv[++i]);
      continue;
    }
    if (arg.startsWith('-')) {
      flags.push(arg);
      continue;
    }
    files.push(arg);
  }
  return { flags, files };
}

function flagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) return args[idx + 1];
  const prefix = `${flag}=`;
  const eq = args.find((a) => a.startsWith(prefix));
  return eq ? eq.slice(prefix.length) : undefined;
}

function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf-8'));
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

const { flags, files } = parseArgv(process.argv.slice(2));

if (flags.includes('--help') || flags.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}

if (flags.includes('--version') || flags.includes('-V')) {
  console.log(readVersion());
  process.exit(0);
}

const root = flagValue(flags, '--root') ?? process.cwd();
const update = flags.includes('--update');
const verbose = flags.includes('--verbose') || flags.includes('-v');
const bail = flags.includes('--bail');
const grep = flagValue(flags, '--grep') ?? flagValue(flags, '-g');
const timeoutRaw = flagValue(flags, '--timeout');
const timeout = timeoutRaw != null ? Number(timeoutRaw) : undefined;
const reporterRaw = flagValue(flags, '--reporter') ?? 'spec';

if (timeoutRaw != null && (!Number.isFinite(timeout) || (timeout as number) < 0)) {
  console.error(`Fatal: invalid --timeout value "${timeoutRaw}"`);
  process.exit(1);
}

if (reporterRaw !== 'spec' && reporterRaw !== 'json') {
  console.error(`Fatal: unknown --reporter "${reporterRaw}" (expected spec or json)`);
  process.exit(1);
}

run({
  root,
  update,
  verbose,
  bail,
  filter: grep,
  timeout,
  files: files.length ? files : undefined,
  reporter: reporterRaw,
}).then(exitCode => {
  process.exit(exitCode);
}).catch(err => {
  console.error(`Fatal: ${err.message}`);
  process.exit(1);
});
