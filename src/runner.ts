/**
 * Test runner — discovers test files, loads them, runs tests, reports results.
 */

import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  setTestFile,
  runAll,
  reset,
  setDefaultTimeout,
  setFilter,
  type TestResult,
} from './api.js';
import { setUpdateSnapshots, clearSnapshotCaches } from './snapshot.js';

export interface RunnerOptions {
  /** Glob / substring pattern for test files */
  pattern?: string;
  /** Root directory to search (default: cwd) */
  root?: string;
  /** Update snapshots */
  update?: boolean;
  /** Verbose output */
  verbose?: boolean;
  /** Default per-test timeout in ms */
  timeout?: number;
  /** Only run tests whose name matches this regex */
  filter?: string | RegExp;
  /** Stop after first failure */
  bail?: boolean;
}

const PASS = '✓';
const FAIL = '✗';
const SKIP = '○';

let tsLoaderReady: Promise<void> | null = null;

/** Register a TypeScript loader once (tsx) so .ts test files can be imported. */
async function ensureTsLoader(): Promise<void> {
  if (tsLoaderReady) return tsLoaderReady;
  tsLoaderReady = (async () => {
    try {
      // Node 20.6+ module.register — prefer tsx ESM hook
      const { register } = await import('node:module');
      const { pathToFileURL: toUrl } = await import('node:url');
      register('tsx/esm', toUrl('./'));
    } catch {
      // Fallback: dynamic import of tsx/esm side-effects (older Node)
      try {
        const tsxEsm: string = 'tsx/esm';
        await import(tsxEsm);
      } catch (err: any) {
        throw new Error(
          `Unable to load TypeScript test files. Install tsx or compile tests to JS.\n` +
          `Underlying error: ${err.message}`,
        );
      }
    }
  })();
  return tsLoaderReady;
}

function findTestFiles(root: string, pattern?: string): string[] {
  const results: string[] = [];
  const patterns = pattern
    ? [pattern]
    : [/\.test\.(ts|mts|js|mjs)$/, /\.spec\.(ts|mts|js|mjs)$/];

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git' ||
          entry === '__snapshots__' || entry.startsWith('.')) continue;
      const full = join(dir, entry);
      let stats;
      try { stats = statSync(full); } catch { continue; }
      if (stats.isDirectory()) {
        walk(full);
      } else if (stats.isFile()) {
        const matches = patterns.some((p: RegExp | string) => {
          if (typeof p === 'string') return entry.includes(p) || full.includes(p);
          return p.test(entry);
        });
        if (matches) results.push(full);
      }
    }
  }

  walk(resolve(root));
  return results.sort();
}

function formatTime(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

async function loadTestFile(file: string): Promise<void> {
  const ext = extname(file);
  if (ext === '.ts' || ext === '.mts' || ext === '.tsx') {
    await ensureTsLoader();
  }
  // Bust ESM module cache so re-runs and sequential files work reliably
  const fileUrl = pathToFileURL(file).href + `?t=${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await import(fileUrl);
}

/**
 * Run tests from the command line.
 * Returns process exit code (0 = all pass, 1 = failures).
 */
export async function run(options: RunnerOptions = {}): Promise<number> {
  const root = options.root || process.cwd();
  const update = options.update ?? process.argv.includes('--update');
  setUpdateSnapshots(update);

  if (options.timeout != null) {
    setDefaultTimeout(options.timeout);
  }

  if (options.filter) {
    setFilter(typeof options.filter === 'string' ? new RegExp(options.filter, 'i') : options.filter);
  } else {
    setFilter(null);
  }

  const testFiles = findTestFiles(root, options.pattern);
  if (testFiles.length === 0) {
    console.log('No test files found.');
    return 0;
  }

  console.log(`\n  cobasaja — just try\n`);
  if (update) console.log('  (snapshot update mode)\n');

  const allResults: TestResult[] = [];
  let bailed = false;

  for (const file of testFiles) {
    if (bailed) break;

    const rel = relative(root, file);
    console.log(` ${rel}`);

    reset();
    setTestFile(file);

    try {
      await loadTestFile(file);
    } catch (err: any) {
      console.error(`  ${FAIL} Failed to load: ${err.message}`);
      allResults.push({
        describe: '',
        test: `Load ${rel}`,
        passed: false,
        error: err.message,
        duration: 0,
      });
      if (options.bail) bailed = true;
      continue;
    }

    let fileResults: TestResult[];
    try {
      fileResults = await runAll();
    } catch (err: any) {
      console.error(`  ${FAIL} Runner error: ${err.message}`);
      allResults.push({
        describe: '',
        test: `Run ${rel}`,
        passed: false,
        error: err.message,
        duration: 0,
      });
      if (options.bail) bailed = true;
      continue;
    } finally {
      clearSnapshotCaches();
    }

    allResults.push(...fileResults);
    for (const r of fileResults) {
      const mark = r.skipped ? SKIP : r.passed ? PASS : FAIL;
      const desc = r.describe ? `${r.describe} › ` : '';
      const skipLabel = r.skipped ? ' (skipped)' : '';
      console.log(`  ${mark} ${desc}${r.test}${skipLabel} (${formatTime(r.duration)})`);
      if (!r.passed && !r.skipped && r.error) {
        const lines = r.error.split('\n');
        for (const line of lines.slice(0, options.verbose ? lines.length : 8)) {
          console.log(`      ${line}`);
        }
        if (!options.verbose && lines.length > 8) {
          console.log(`      ... (${lines.length - 8} more lines, use --verbose)`);
        }
      }
    }
    console.log();
    if (options.verbose) {
      const failed = fileResults.filter(r => !r.passed && !r.skipped).length;
      const skipped = fileResults.filter(r => r.skipped).length;
      console.log(`  ${fileResults.length} tests, ${failed} failed, ${skipped} skipped`);
    }

    if (options.bail && fileResults.some(r => !r.passed && !r.skipped)) {
      bailed = true;
    }
  }

  const failed = allResults.filter(r => !r.passed && !r.skipped);
  const skipped = allResults.filter(r => r.skipped);
  const passed = allResults.filter(r => r.passed && !r.skipped);
  const total = allResults.length;
  const totalDuration = allResults.reduce((s, r) => s + r.duration, 0);

  let summary = `Results: ${passed.length}/${total} passed (${formatTime(totalDuration)})`;
  if (skipped.length > 0) summary += `, ${skipped.length} skipped`;
  if (bailed) summary += ` (bailed)`;
  console.log(summary);

  if (failed.length > 0) {
    console.log(`\nFailed tests:`);
    for (const f of failed) {
      const label = f.describe ? `${f.describe} › ${f.test}` : f.test;
      console.log(`  ${FAIL} ${label}`);
    }
  }

  return failed.length > 0 ? 1 : 0;
}
