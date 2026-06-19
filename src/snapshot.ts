/**
 * Snapshot testing — store deterministic MCP responses for regression testing.
 * Snapshots are stored alongside test files in __snapshots__/ directories.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

interface SnapshotStore {
  [key: string]: unknown;
}

let updateSnapshots = false;
const loadedStores = new Map<string, SnapshotStore>();

/** Set whether to update snapshots (--update flag) */
export function setUpdateSnapshots(update: boolean): void {
  updateSnapshots = update;
}

/** Resolve snapshot file path from test file path and test name */
function snapshotPath(testFile: string): string {
  const dir = dirname(testFile);
  const snapDir = join(dir, '__snapshots__');
  const baseName = testFile.split('/').pop() || 'test';
  return join(snapDir, `${baseName}.snap.json`);
}

/** Load or create a snapshot store for a given test file */
function getStore(testFile: string): SnapshotStore {
  if (!loadedStores.has(testFile)) {
    const path = snapshotPath(testFile);
    let store: SnapshotStore = {};
    if (existsSync(path)) {
      try {
        store = JSON.parse(readFileSync(path, 'utf-8'));
      } catch {
        // Corrupt snapshot — start fresh
      }
    }
    loadedStores.set(testFile, store);
  }
  return loadedStores.get(testFile)!;
}

/** Save a snapshot store back to disk */
function saveStore(testFile: string): void {
  const store = getStore(testFile);
  const path = snapshotPath(testFile);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(store, null, 2) + '\n');
}

/**
 * Assert that a value matches a stored snapshot.
 * On first run, creates the snapshot. On subsequent runs, compares.
 * Pass --update to overwrite all snapshots.
 */
export function toMatchSnapshot(testFile: string, testName: string, actual: unknown): void {
  const store = getStore(testFile);
  const key = `${testName}`;

  if (updateSnapshots || !(key in store)) {
    store[key] = actual;
    saveStore(testFile);
    return; // Pass on create/update
  }

  const expected = store[key];
  const actualJson = JSON.stringify(actual, null, 2);
  const expectedJson = JSON.stringify(expected, null, 2);

  if (actualJson !== expectedJson) {
    // Build a diff message
    const diffLines: string[] = [];
    const actualLines = actualJson.split('\n');
    const expectedLines = expectedJson.split('\n');
    const maxLen = Math.max(actualLines.length, expectedLines.length);
    let differences = 0;

    for (let i = 0; i < maxLen && differences < 5; i++) {
      const a = actualLines[i] ?? '';
      const e = expectedLines[i] ?? '';
      if (a !== e) {
        diffLines.push(`  - ${e}`);
        diffLines.push(`  + ${a}`);
        differences++;
      }
    }
    if (maxLen > 5 && (actualLines.length !== expectedLines.length)) {
      diffLines.push(`  ... (${actualLines.length} vs ${expectedLines.length} lines)`);
    }

    throw new Error(
      `Snapshot mismatch: "${testName}"\n\n` +
      `Expected snapshot:\n${expectedJson.slice(0, 500)}\n\n` +
      `Actual:\n${actualJson.slice(0, 500)}\n\n` +
      `Pass --update to overwrite snapshots.\n` +
      `Diff (first ${differences} differences):\n${diffLines.join('\n')}`
    );
  }
}
