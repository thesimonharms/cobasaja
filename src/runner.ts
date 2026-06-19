/**
 * Test runner — discovers test files, loads them, runs tests, reports results.
 */

import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setTestFile, runAll, reset, type TestResult } from './api.js';
import { setUpdateSnapshots } from './snapshot.js';

export interface RunnerOptions {
  /** Glob pattern for test files (eg. ** / *.test.ts) */
  pattern?: string;
  /** Root directory to search (default: cwd) */
  root?: string;
  /** Update snapshots */
  update?: boolean;
  /** Verbose output */
  verbose?: boolean;
}

const PASS = '✓';
const FAIL = '✗';

function findTestFiles(root: string, pattern?: string): string[] {
  // Simple file walk for .test.ts / .spec.ts / .test.mts files
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
      // Skip node_modules, dist, .git, __snapshots__
      if (entry === 'node_modules' || entry === 'dist' || entry === '.git' ||
          entry === '__snapshots__' || entry.startsWith('.')) continue;
      const full = join(dir, entry);
      let stats;
      try { stats = statSync(full); } catch { continue; }
      if (stats.isDirectory()) {
        walk(full);
      } else if (stats.isFile()) {
        const matches = patterns.some((p: RegExp | string) => {
          if (typeof p === 'string') return entry.includes(p);
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

function report(results: TestResult[], root: string): { passed: number; failed: number; duration: number } {
  const passed = results.filter(r => r.passed);
  const failed = results.filter(r => !r.passed);
  const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);
  const currentDesc = new Map<string, { indent: string; desc: string }>();

  for (const r of results) {
    if (r.describe && !currentDesc.has(r.describe)) {
      const label = r.describe ? `\n  ${r.describe}` : '';
      console.log(label);
      currentDesc.set(r.describe, { indent: '    ', desc: r.describe });
    }
    const indent = r.describe ? '    ' : '  ';
    const mark = r.passed ? PASS : FAIL;
    console.log(`${indent}${mark} ${r.test} (${formatTime(r.duration)})`);
    if (!r.passed && r.error) {
      // Indent the error message
      const lines = r.error.split('\n');
      for (const line of lines) {
        console.log(`${indent}  ${line}`);
      }
    }
  }

  const total = results.length;
  console.log(`\n${passed.length}/${total} passed (${formatTime(totalDuration)})`);
  if (failed.length > 0) {
    console.log(`Failed:`);
    for (const f of failed) {
      console.log(`  ${FAIL} ${f.describe ? `${f.describe} › ` : ''}${f.test}`);
    }
  }

  return { passed: passed.length, failed: failed.length, duration: totalDuration };
}

/**
 * Run tests from the command line.
 * Returns process exit code (0 = all pass, 1 = failures).
 */
export async function run(options: RunnerOptions = {}): Promise<number> {
  const root = options.root || process.cwd();
  const update = options.update ?? process.argv.includes('--update');
  setUpdateSnapshots(update);

  const testFiles = findTestFiles(root, options.pattern);
  if (testFiles.length === 0) {
    console.log('No test files found.');
    return 0;
  }

  console.log(`\n  cobasaja — just try\n`);
  if (update) console.log('  (snapshot update mode)\n');

  const allResults: TestResult[] = [];

  for (const file of testFiles) {
    const rel = relative(root, file);
    console.log(` ${rel}`);

    reset();
    setTestFile(file);

    try {
      // Dynamic import the test file
      const fileUrl = pathToFileURL(file).href;
      await import(fileUrl);
    } catch (err: any) {
      console.error(`  ${FAIL} Failed to load: ${err.message}`);
      allResults.push({
        describe: '',
        test: `Load ${rel}`,
        passed: false,
        error: err.message,
        duration: 0,
      });
      continue;
    }

    let fileResults: TestResult[];
    try {
      fileResults = await runAll();
    } catch (err: any) {
      console.error(`  ${FAIL} Runner error: ${err.message}`);
      continue;
    }

    allResults.push(...fileResults);
    for (const r of fileResults) {
      const mark = r.passed ? PASS : FAIL;
      const desc = r.describe ? `${r.describe} › ` : '';
      console.log(`  ${mark} ${desc}${r.test} (${formatTime(r.duration)})`);
      if (!r.passed && r.error) {
        console.log(`      ${r.error}`);
      }
    }
    console.log();
  }

  const failed = allResults.filter(r => !r.passed);
  const total = allResults.length;
  const totalDuration = allResults.reduce((s, r) => s + r.duration, 0);
  console.log(`Results: ${total - failed.length}/${total} passed (${formatTime(totalDuration)})`);

  if (failed.length > 0) {
    console.log(`\nFailed tests:`);
    for (const f of failed) {
      const label = f.describe ? `${f.describe} › ${f.test}` : f.test;
      console.log(`  ${FAIL} ${label}`);
    }
  }

  return failed.length > 0 ? 1 : 0;
}
