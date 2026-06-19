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
import { Expectation, expect as baseExpect } from './matchers.js';
import { toMatchSnapshot } from './snapshot.js';

// ── Types ────────────────────────────────────────────────────────────────────

/** Context passed to every test function */
export interface TestContext {
  /** Pre-fetched tool definitions from the MCP server */
  tools: McpToolDefinition[];
  /** Call any MCP tool by name with arguments */
  call: (name: string, args?: Record<string, unknown>) => Promise<McpToolResult>;
  /** The raw MCP client for advanced use */
  client: McpClient;
  /** Take a snapshot of a value (test file resolved automatically) */
  snapshot: (value: unknown) => void;
}

type TestFn = (ctx: TestContext) => void | Promise<void>;

interface TestCase {
  name: string;
  fn: TestFn;
}

interface DescribeBlock {
  name: string;
  tests: TestCase[];
  beforeAll?: () => void | Promise<void>;
  afterAll?: () => void | Promise<void>;
  beforeEach?: () => void | Promise<void>;
  afterEach?: () => void | Promise<void>;
}

// ── Global State ─────────────────────────────────────────────────────────────

let serverConfig: McpServerConfig | null = null;
const describeBlocks: DescribeBlock[] = [];
let currentDescribe: DescribeBlock | null = null;
let currentTestFile = '';

// ── API ──────────────────────────────────────────────────────────────────────

/** Configure the MCP server under test */
export function defineServer(config: McpServerConfig): void {
  serverConfig = config;
}

/** Set the current test file path (set by the runner) */
export function setTestFile(file: string): void {
  currentTestFile = file;
}

/** Register a describe block */
export function describe(name: string, fn: () => void): void {
  const block: DescribeBlock = {
    name,
    tests: [],
  };
  currentDescribe = block;
  fn();
  currentDescribe = null;
  describeBlocks.push(block);
}

/** Register a test case */
export function it(name: string, fn: TestFn): void {
  if (currentDescribe) {
    currentDescribe.tests.push({ name, fn });
  } else {
    // Top-level: implicitly wrap in a global describe
    const block: DescribeBlock = { name: '', tests: [{ name, fn }] };
    describeBlocks.push(block);
  }
}

/** Alias for `it` */
export const test = it;

// ── Hooks ────────────────────────────────────────────────────────────────────

// Simple hooks that apply to the current describe block
export function beforeAll(fn: () => void | Promise<void>): void {
  if (currentDescribe) currentDescribe.beforeAll = fn;
}
export function afterAll(fn: () => void | Promise<void>): void {
  if (currentDescribe) currentDescribe.afterAll = fn;
}
export function beforeEach(fn: () => void | Promise<void>): void {
  if (currentDescribe) currentDescribe.beforeEach = fn;
}
export function afterEach(fn: () => void | Promise<void>): void {
  if (currentDescribe) currentDescribe.afterEach = fn;
}

// ── Expect with snapshot ─────────────────────────────────────────────────────

/** Extended expect that supports `.toMatchSnapshot()` */
export function expect<T>(actual: T): CobasajaExpectation<T> {
  return new CobasajaExpectation(actual);
}

class CobasajaExpectation<T> extends Expectation<T> {
  constructor(actual: T) {
    super(actual);
  }

  /** Assert the value matches a stored snapshot */
  toMatchSnapshot(testName?: string): void {
    const name = testName ?? inferTestName();
    toMatchSnapshot(currentTestFile, name, this['actual'] ?? this);
  }
}

// Since Expectation stores `actual` as a private field with a `#` or `private` prefix,
// we need a way to access it for snapshots. Let's keep a reference.
// Actually, Expectation uses `private actual`, which in TS compiled output is just
// a regular property. The `this['actual']` access works at runtime.

function inferTestName(): string {
  // Try to get the test name from the call stack or fallback
  return 'snapshot';
}

// ── Runner (internal) ────────────────────────────────────────────────────────

export interface TestResult {
  describe: string;
  test: string;
  passed: boolean;
  error?: string;
  duration: number;
}

/** Run all registered tests. Returns results. */
export async function runAll(): Promise<TestResult[]> {
  const results: TestResult[] = [];

  for (const block of describeBlocks) {
    let ctx: TestContext;

    if (serverConfig) {
      // MCP mode — connect once per describe block
      const client = new McpClient(serverConfig);

      try {
        await client.connect();
        ctx = {
          tools: client.tools,
          call: (name, args) => client.callTool(name, args),
          client,
          snapshot: (value) => toMatchSnapshot(currentTestFile, `${block.name} ${'snapshot'}`, value),
        };

        await block.beforeAll?.();
      } catch (err: any) {
        // Connection failed — report all tests in this block as failed
        for (const t of block.tests) {
          results.push({
            describe: block.name,
            test: t.name,
            passed: false,
            error: `Connection failed: ${err.message}`,
            duration: 0,
          });
        }
        await client.close().catch(() => {});
        continue;
      }

      // Run each test
      for (const t of block.tests) {
        const start = performance.now();
        try {
          await block.beforeEach?.();
          // Override snapshot with per-test key so multiple tests in a block
          // produce unique snapshot keys ("describe_name test_name")
          ctx.snapshot = (value: unknown) =>
            toMatchSnapshot(currentTestFile, `${block.name} ${t.name}`, value);
          await t.fn(ctx);
          results.push({
            describe: block.name,
            test: t.name,
            passed: true,
            duration: Math.round(performance.now() - start),
          });
        } catch (err: any) {
          results.push({
            describe: block.name,
            test: t.name,
            passed: false,
            error: err.message,
            duration: Math.round(performance.now() - start),
          });
        } finally {
          await block.afterEach?.();
        }
      }

      await block.afterAll?.();
      await client.close().catch(() => {});
    } else {
      // Unit-test mode — no MCP server, tests get a non-functional context
      ctx = {
        tools: [],
        call: () => { throw new Error('No MCP server configured — call defineServer()'); },
        client: null as any,
        snapshot: () => { throw new Error('Snapshots require an MCP server — call defineServer()'); },
      };

      for (const t of block.tests) {
        const start = performance.now();
        try {
          await block.beforeEach?.();
          await t.fn(ctx);
          results.push({
            describe: block.name,
            test: t.name,
            passed: true,
            duration: Math.round(performance.now() - start),
          });
        } catch (err: any) {
          results.push({
            describe: block.name,
            test: t.name,
            passed: false,
            error: err.message,
            duration: Math.round(performance.now() - start),
          });
        } finally {
          await block.afterEach?.();
        }
      }
    }
  }

  return results;
}

/** Reset all registered tests (for re-runs) */
export function reset(): void {
  describeBlocks.length = 0;
  currentDescribe = null;
  serverConfig = null;
}
