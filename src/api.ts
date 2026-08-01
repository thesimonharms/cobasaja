/**
 * cobasaja DSL — defineServer, describe, it, and test context.
 *
 * Usage:
 *   import { defineServer, describe, it, expect } from 'cobasaja';
 *
 *   defineServer({ command: 'node', args: ['./dist/index.js'] });
 *
 *   it('lists the greeting tool', async ({ tools, call }) => {
 *     expect(tools).toHaveTool('greet');
 *     const r = await call('greet', { name: 'World' });
 *     expect(r).toBeSuccessful();
 *   });
 *
 *   describe('calculator', () => {
 *     it('adds numbers', async ({ call }) => {
 *       const r = await call('add', { a: 1, b: 2 });
 *       expect(r.text).toBe('3');
 *     });
 *   });
 */

import type { McpServerConfig, McpToolDefinition, McpToolResult } from './client.js';
import { McpClient } from './client.js';
import { Expectation, cleanStack } from './matchers.js';
import { toMatchSnapshot, clearSnapshotCaches } from './snapshot.js';
import { withTimeout } from './utils.js';

// ── Types ────────────────────────────────────────────────────────────────────

/** Context passed to every test function */
export interface TestContext {
  /** Pre-fetched tool definitions from the MCP server */
  tools: McpToolDefinition[];
  /** Call any MCP tool by name with arguments */
  call: (name: string, args?: Record<string, unknown>) => Promise<McpToolResult>;
  /** The raw MCP client for advanced use (null in unit-test mode) */
  client: McpClient | null;
  /** Take a snapshot of a value (test file resolved automatically) */
  snapshot: (value: unknown) => void;
}

type TestFn = (ctx: TestContext) => void | Promise<void>;
type HookFn = () => void | Promise<void>;

export interface ItOptions {
  /** Per-test timeout in ms. Overrides the default. */
  timeout?: number;
  /** Skip this test */
  skip?: boolean;
  /** Run only this test (and other `.only` tests) */
  only?: boolean;
}

interface TestCase {
  name: string;
  fn: TestFn;
  timeout?: number;
  skip: boolean;
  only: boolean;
}

type SuiteEntry =
  | { kind: 'test'; test: TestCase }
  | { kind: 'describe'; block: DescribeBlock };

interface DescribeBlock {
  name: string;
  entries: SuiteEntry[];
  beforeAll: HookFn[];
  afterAll: HookFn[];
  beforeEach: HookFn[];
  afterEach: HookFn[];
  skip: boolean;
  only: boolean;
}

// ── Global State ─────────────────────────────────────────────────────────────

let serverConfig: McpServerConfig | null = null;
/** Implicit file-level suite so top-level hooks/tests have a home */
const fileSuite: DescribeBlock = createBlock('');
const describeStack: DescribeBlock[] = [];
let currentTestFile = '';
let currentTestName = '';
let defaultTimeout = 10_000;
let filterPattern: RegExp | null = null;

function createBlock(name: string, skip = false, only = false): DescribeBlock {
  return {
    name,
    entries: [],
    beforeAll: [],
    afterAll: [],
    beforeEach: [],
    afterEach: [],
    skip,
    only,
  };
}

// ── API ──────────────────────────────────────────────────────────────────────

/** Configure the MCP server under test */
export function defineServer(config: McpServerConfig): void {
  serverConfig = config;
}

/** Set the current test file path (set by the runner) */
export function setTestFile(file: string): void {
  currentTestFile = file;
}

/** Set the default per-test timeout in ms */
export function setDefaultTimeout(ms: number): void {
  defaultTimeout = ms;
}

/** Set an optional name filter (only matching tests run) */
export function setFilter(pattern: RegExp | null): void {
  filterPattern = pattern;
}

/** Get the currently running test's full name (for snapshots) */
export function getCurrentTestName(): string {
  return currentTestName;
}

function currentDescribe(): DescribeBlock {
  return describeStack.length > 0 ? describeStack[describeStack.length - 1] : fileSuite;
}

/** Register a describe block (supports nesting) */
export function describe(name: string, fn: () => void): void {
  registerDescribe(name, fn, false, false);
}

describe.skip = (name: string, fn: () => void): void => {
  registerDescribe(name, fn, true, false);
};

describe.only = (name: string, fn: () => void): void => {
  registerDescribe(name, fn, false, true);
};

function registerDescribe(name: string, fn: () => void, skip: boolean, only: boolean): void {
  const block = createBlock(name, skip, only);
  const parent = currentDescribe();
  describeStack.push(block);
  try {
    fn();
  } finally {
    describeStack.pop();
  }
  parent.entries.push({ kind: 'describe', block });
}

/** Register a test case */
export function it(name: string, fn: TestFn, options?: ItOptions | number): void {
  registerIt(name, fn, options, false, false);
}

it.skip = (name: string, fn: TestFn, options?: ItOptions | number): void => {
  registerIt(name, fn, options, true, false);
};

it.only = (name: string, fn: TestFn, options?: ItOptions | number): void => {
  registerIt(name, fn, options, false, true);
};

function registerIt(
  name: string,
  fn: TestFn,
  options: ItOptions | number | undefined,
  skip: boolean,
  only: boolean,
): void {
  const opts: ItOptions = typeof options === 'number' ? { timeout: options } : (options ?? {});
  const testCase: TestCase = {
    name,
    fn,
    timeout: opts.timeout,
    skip: skip || !!opts.skip,
    only: only || !!opts.only,
  };
  currentDescribe().entries.push({ kind: 'test', test: testCase });
}

/** Alias for `it` */
export const test = it;

// ── Hooks ────────────────────────────────────────────────────────────────────

export function beforeAll(fn: HookFn): void {
  currentDescribe().beforeAll.push(fn);
}

export function afterAll(fn: HookFn): void {
  currentDescribe().afterAll.push(fn);
}

export function beforeEach(fn: HookFn): void {
  currentDescribe().beforeEach.push(fn);
}

export function afterEach(fn: HookFn): void {
  currentDescribe().afterEach.push(fn);
}

// ── Expect with snapshot ─────────────────────────────────────────────────────

/** Extended expect that supports `.toMatchSnapshot()` */
export function expect<T>(actual: T): CobasajaExpectation<T> {
  return new CobasajaExpectation(actual);
}

class CobasajaExpectation<T> extends Expectation<T> {
  constructor(actual: T, isNot = false) {
    super(actual, isNot);
  }

  override get not(): CobasajaExpectation<T> {
    return new CobasajaExpectation(this.actual, !this.isNot);
  }

  /** Assert the value matches a stored snapshot */
  toMatchSnapshot(testName?: string): void {
    if (this.isNot) {
      throw new Error('.not.toMatchSnapshot() is not supported');
    }
    const name = testName ?? (currentTestName || 'snapshot');
    toMatchSnapshot(currentTestFile, name, this.actual);
  }
}

// ── Runner (internal) ────────────────────────────────────────────────────────

export interface TestResult {
  describe: string;
  test: string;
  passed: boolean;
  skipped?: boolean;
  error?: string;
  duration: number;
}

interface CollectedTest {
  fullDescribe: string;
  test: TestCase;
  beforeEach: HookFn[];
  afterEach: HookFn[];
  /** beforeAll hooks that must run before this test's block (keyed by block identity) */
  blockPath: DescribeBlock[];
}

function collectHasOnly(blocks: DescribeBlock[]): boolean {
  for (const b of blocks) {
    if (b.only) return true;
    for (const entry of b.entries) {
      if (entry.kind === 'test' && entry.test.only) return true;
      if (entry.kind === 'describe' && collectHasOnly([entry.block])) return true;
    }
  }
  return false;
}

function matchesFilter(describePath: string, testName: string): boolean {
  if (!filterPattern) return true;
  const label = describePath ? `${describePath} ${testName}` : testName;
  return filterPattern.test(label) || filterPattern.test(testName);
}

/**
 * Flatten the describe tree into an ordered list of runnable tests,
 * accumulating inherited hooks along the path. Preserves definition order.
 */
function collectTests(blocks: DescribeBlock[], onlyMode: boolean): CollectedTest[] {
  const out: CollectedTest[] = [];

  function walk(
    block: DescribeBlock,
    parentDescribe: string,
    inheritedBeforeEach: HookFn[],
    inheritedAfterEach: HookFn[],
    parentPath: DescribeBlock[],
    parentSkipped: boolean,
  ): void {
    const describePath = parentDescribe
      ? (block.name ? `${parentDescribe} › ${block.name}` : parentDescribe)
      : block.name;
    const path = [...parentPath, block];
    const beforeEach = [...inheritedBeforeEach, ...block.beforeEach];
    const afterEach = [...block.afterEach, ...inheritedAfterEach]; // inner first on after
    const skipped = parentSkipped || block.skip;
    const underOnly = path.some((p) => p.only);

    for (const entry of block.entries) {
      if (entry.kind === 'test') {
        const t = entry.test;
        if (onlyMode && !t.only && !underOnly) continue;
        if (!matchesFilter(describePath, t.name)) continue;
        out.push({
          fullDescribe: describePath,
          test: { ...t, skip: skipped || t.skip },
          beforeEach,
          afterEach,
          blockPath: path,
        });
      } else {
        walk(entry.block, describePath, beforeEach, afterEach, path, skipped);
      }
    }
  }

  for (const block of blocks) {
    walk(block, '', [], [], [], false);
  }
  return out;
}

function makeUnitContext(): TestContext {
  return {
    tools: [],
    call: async () => {
      throw new Error('No MCP server configured — call defineServer()');
    },
    client: null,
    snapshot: (value: unknown) => {
      toMatchSnapshot(currentTestFile, currentTestName || 'snapshot', value);
    },
  };
}

async function runHooks(hooks: HookFn[], label: string): Promise<void> {
  for (const hook of hooks) {
    await withTimeout(Promise.resolve(hook()), defaultTimeout, label);
  }
}

/** Run all registered tests. Returns results. */
export async function runAll(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const suites = [fileSuite];
  const onlyMode = collectHasOnly(suites);
  const collected = collectTests(suites, onlyMode);

  // Group by top-level connection strategy: one MCP client shared across the
  // whole file when defineServer is set (reused for stability/speed), with
  // reconnect on failure.
  let client: McpClient | null = null;
  let ctx: TestContext = makeUnitContext();

  if (serverConfig) {
    client = new McpClient(serverConfig);
    try {
      await client.connect();
      ctx = {
        tools: client.tools,
        call: (name, args) => client!.callTool(name, args),
        client,
        snapshot: (value) => toMatchSnapshot(currentTestFile, currentTestName || 'snapshot', value),
      };
    } catch (err: any) {
      for (const item of collected) {
        results.push({
          describe: item.fullDescribe,
          test: item.test.name,
          passed: false,
          error: `Connection failed: ${err.message}`,
          duration: 0,
        });
      }
      await client.close().catch(() => {});
      return results;
    }
  }

  // Track which describe blocks have had beforeAll / afterAll run
  const beforeAllDone = new Set<DescribeBlock>();
  const beforeAllFailed = new Set<DescribeBlock>();
  const afterAllPending = new Map<DescribeBlock, number>();

  for (const item of collected) {
    for (const b of item.blockPath) {
      afterAllPending.set(b, (afterAllPending.get(b) ?? 0) + 1);
    }
  }

  async function finishBlockCounters(blockPath: DescribeBlock[]): Promise<void> {
    for (let i = blockPath.length - 1; i >= 0; i--) {
      const blk = blockPath[i];
      const left = (afterAllPending.get(blk) ?? 1) - 1;
      afterAllPending.set(blk, left);
      if (left === 0 && blk.afterAll.length > 0) {
        try {
          await runHooks(blk.afterAll, `afterAll (${blk.name || 'root'})`);
        } catch (err: any) {
          results.push({
            describe: blk.name,
            test: '(afterAll)',
            passed: false,
            error: err.message,
            duration: 0,
          });
        }
      }
    }
  }

  try {
    for (const item of collected) {
      const { test: t, fullDescribe, beforeEach, afterEach, blockPath } = item;

      // Run beforeAll for any blocks on the path that haven't run yet
      let setupFailed = false;
      for (const b of blockPath) {
        if (beforeAllFailed.has(b)) {
          setupFailed = true;
          break;
        }
        if (!beforeAllDone.has(b)) {
          beforeAllDone.add(b);
          if (!t.skip && b.beforeAll.length > 0) {
            try {
              await runHooks(b.beforeAll, `beforeAll (${b.name || 'root'})`);
            } catch (err: any) {
              beforeAllFailed.add(b);
              setupFailed = true;
              results.push({
                describe: fullDescribe,
                test: t.name,
                passed: false,
                error: `beforeAll failed: ${err.message}`,
                duration: 0,
              });
              break;
            }
          }
        }
      }

      if (setupFailed) {
        // If we already recorded a failure above for this test, just finish counters.
        // If failure was from a prior sibling's beforeAll, record it here.
        if (!results.some((r) => r.describe === fullDescribe && r.test === t.name)) {
          results.push({
            describe: fullDescribe,
            test: t.name,
            passed: false,
            error: 'beforeAll failed in enclosing describe block',
            duration: 0,
          });
        }
        await finishBlockCounters(blockPath);
        continue;
      }

      if (t.skip) {
        results.push({
          describe: fullDescribe,
          test: t.name,
          passed: true,
          skipped: true,
          duration: 0,
        });
      } else {
        currentTestName = fullDescribe ? `${fullDescribe} ${t.name}` : t.name;
        ctx.snapshot = (value: unknown) =>
          toMatchSnapshot(currentTestFile, currentTestName, value);

        const timeout = t.timeout ?? defaultTimeout;
        const start = performance.now();
        try {
          await runHooks(beforeEach, 'beforeEach');
          await withTimeout(Promise.resolve(t.fn(ctx)), timeout, `Test "${t.name}"`);
          results.push({
            describe: fullDescribe,
            test: t.name,
            passed: true,
            duration: Math.round(performance.now() - start),
          });
        } catch (err: any) {
          const message = err?.stack ? cleanStack(String(err.stack)) : (err?.message ?? String(err));
          results.push({
            describe: fullDescribe,
            test: t.name,
            passed: false,
            error: message,
            duration: Math.round(performance.now() - start),
          });
        } finally {
          try {
            await runHooks(afterEach, 'afterEach');
          } catch (err: any) {
            const last = results[results.length - 1];
            if (last && last.passed) {
              last.passed = false;
              last.error = `afterEach failed: ${err.message}`;
            }
          }
          currentTestName = '';
        }
      }

      await finishBlockCounters(blockPath);
    }
  } finally {
    if (client) {
      await client.close().catch(() => {});
    }
  }

  return results;
}

/** Reset all registered tests (for re-runs / between files) */
export function reset(): void {
  fileSuite.entries.length = 0;
  fileSuite.beforeAll.length = 0;
  fileSuite.afterAll.length = 0;
  fileSuite.beforeEach.length = 0;
  fileSuite.afterEach.length = 0;
  fileSuite.skip = false;
  fileSuite.only = false;
  describeStack.length = 0;
  serverConfig = null;
  currentTestName = '';
  clearSnapshotCaches();
}
