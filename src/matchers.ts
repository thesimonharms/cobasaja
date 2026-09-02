/**
 * Expectation/assertion system inspired by Jest/Vitest.
 * Supports chaining, `.not` modifier, and MCP-specific matchers.
 */

import { extractText } from './client.js';
import { deepEqual, matchObject } from './utils.js';

/** Best-effort text extraction from MCP results, content arrays, or strings. */
export function textOf(actual: unknown): string {
  if (typeof actual === 'string') return actual;
  if (actual == null || typeof actual !== 'object') return '';
  const obj = actual as Record<string, unknown>;
  if (typeof obj.text === 'string') return obj.text;
  if (Array.isArray(obj.content)) return extractText(obj.content);
  if (Array.isArray(obj.contents)) return extractText(obj.contents);
  if (Array.isArray(obj.messages)) {
    const parts = [];
    for (const message of obj.messages as { content?: unknown }[]) {
      if (Array.isArray(message.content)) parts.push(...message.content);
      else if (message.content && typeof message.content === 'object') parts.push(message.content);
    }
    return extractText(parts as import('./client.js').McpContentPart[]);
  }
  return '';
}

export class Expectation<T> {
  protected actual: T;
  protected isNot: boolean;

  constructor(actual: T, isNot = false) {
    this.actual = actual;
    this.isNot = isNot;
  }

  /** Negation modifier: `expect(x).not.toBe(y)` */
  get not(): Expectation<T> {
    return new Expectation(this.actual, !this.isNot);
  }

  // ── Equality ──

  /** Strict equality (===) */
  toBe(expected: unknown): void {
    this.assert(
      this.actual === expected,
      `Expected ${this.repr(expected)}${this.notStr} but got ${this.repr(this.actual)}`,
    );
  }

  /** Deep equality */
  toEqual(expected: unknown): void {
    const pass = deepEqual(this.actual, expected);
    this.assert(
      pass,
      `Expected ${this.repr(expected)}${this.notStr} but got ${this.repr(this.actual)}`,
    );
  }

  // ── Truthiness ──

  toBeDefined(): void {
    this.assert(
      this.actual !== undefined,
      `Expected value to be defined${this.notStr} but got undefined`,
    );
  }

  toBeUndefined(): void {
    this.assert(
      this.actual === undefined,
      `Expected value to be undefined${this.notStr} but got ${this.repr(this.actual)}`,
    );
  }

  toBeNull(): void {
    this.assert(
      this.actual === null,
      `Expected null${this.notStr} but got ${this.repr(this.actual)}`,
    );
  }

  toBeTruthy(): void {
    this.assert(
      !!this.actual,
      `Expected truthy value${this.notStr} but got ${this.repr(this.actual)}`,
    );
  }

  toBeFalsy(): void {
    this.assert(
      !this.actual,
      `Expected falsy value${this.notStr} but got ${this.repr(this.actual)}`,
    );
  }

  // ── Numeric matchers ──

  /** Value is greater than expected */
  toBeGreaterThan(expected: number): void {
    const actual = this.actual as any;
    this.assert(
      typeof actual === 'number' && actual > expected,
      `Expected ${actual} to be > ${expected}${this.notStr}`,
    );
  }

  /** Value is greater than or equal to expected */
  toBeGreaterThanOrEqual(expected: number): void {
    const actual = this.actual as any;
    this.assert(
      typeof actual === 'number' && actual >= expected,
      `Expected ${actual} to be >= ${expected}${this.notStr}`,
    );
  }

  /** Value is less than expected */
  toBeLessThan(expected: number): void {
    const actual = this.actual as any;
    this.assert(
      typeof actual === 'number' && actual < expected,
      `Expected ${actual} to be < ${expected}${this.notStr}`,
    );
  }

  /** Value is less than or equal to expected */
  toBeLessThanOrEqual(expected: number): void {
    const actual = this.actual as any;
    this.assert(
      typeof actual === 'number' && actual <= expected,
      `Expected ${actual} to be <= ${expected}${this.notStr}`,
    );
  }

  /** Floating-point comparison with numDigits precision */
  toBeCloseTo(expected: number, numDigits: number = 2): void {
    const actual = this.actual as any;
    const precision = Math.pow(10, -numDigits);
    const diff = Math.abs((actual as number) - expected);
    this.assert(
      typeof actual === 'number' && Number.isFinite(actual) && diff < precision,
      `Expected ${actual} to be close to ${expected} (within ${numDigits} decimal places)${this.notStr}`,
    );
  }

  // ── String match ──

  /** String matches a RegExp (or a string treated as a RegExp). */
  toMatch(pattern: RegExp | string): void {
    const actual = typeof this.actual === 'string' ? this.actual : String(this.actual);
    const re = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    this.assert(
      re.test(actual),
      `Expected ${this.repr(actual)} to match ${re}${this.notStr}`,
    );
  }

  // ── Containment ──

  /** String or array contains */
  toContain(expected: unknown): void {
    const actual = this.actual as any;
    let pass = false;
    if (typeof actual === 'string' && typeof expected === 'string') {
      pass = actual.includes(expected);
    } else if (Array.isArray(actual)) {
      pass = actual.some((item: unknown) => deepEqual(item, expected));
    }
    this.assert(
      pass,
      `Expected ${this.repr(actual)} to contain ${this.repr(expected)}${this.notStr}`,
    );
  }

  // ── Type checks ──

  toBeInstanceOf(cls: new (...args: any[]) => unknown): void {
    this.assert(
      this.actual instanceof cls,
      `Expected ${this.repr(this.actual)} to be instance of ${cls.name}${this.notStr}`,
    );
  }

  toHaveLength(n: number): void {
    const actual = this.actual as any;
    this.assert(
      actual != null && typeof actual.length === 'number' && actual.length === n,
      `Expected ${this.repr(actual)} to have length ${n}${this.notStr}`,
    );
  }

  // ── Partial match ──

  toMatchObject(expected: Record<string, unknown>): void {
    const pass = matchObject(this.actual, expected);
    this.assert(
      pass,
      `Expected ${this.repr(this.actual)} to match object ${this.repr(expected)}${this.notStr}`,
    );
  }

  // ── MCP-specific ──

  /** Tool call returned successfully (no isError) */
  toBeSuccessful(): void {
    const r = this.actual as any;
    this.assert(
      r?.isError !== true,
      `Expected successful MCP result${this.notStr} but got error: ${this.repr(r)}`,
    );
  }

  /** Tool call resulted in an error */
  toHaveErrored(): void {
    const r = this.actual as any;
    this.assert(
      r?.isError === true,
      `Expected MCP error${this.notStr} but got success: ${this.repr(r)}`,
    );
  }

  /** Tool list includes a tool by name */
  toHaveTool(name: string): void {
    const tools = Array.isArray(this.actual) ? this.actual : [];
    const pass = tools.some((t: any) => t.name === name);
    this.assert(
      pass,
      `Expected tools to include "${name}"${this.notStr}. Available: [${
        tools.map((t: any) => t.name).join(', ')
      }]`,
    );
  }

  /** Resource list includes a resource by URI or name */
  toHaveResource(uriOrName: string): void {
    const resources = Array.isArray(this.actual) ? this.actual : [];
    const pass = resources.some((r: any) => r.uri === uriOrName || r.name === uriOrName);
    this.assert(
      pass,
      `Expected resources to include "${uriOrName}"${this.notStr}. Available: [${
        resources.map((r: any) => r.uri ?? r.name).join(', ')
      }]`,
    );
  }

  /** Prompt list includes a prompt by name */
  toHavePrompt(name: string): void {
    const prompts = Array.isArray(this.actual) ? this.actual : [];
    const pass = prompts.some((p: any) => p.name === name);
    this.assert(
      pass,
      `Expected prompts to include "${name}"${this.notStr}. Available: [${
        prompts.map((p: any) => p.name).join(', ')
      }]`,
    );
  }

  /** MCP result / content text equals a string or matches a RegExp */
  toHaveText(expected: string | RegExp): void {
    const text = textOf(this.actual);
    const pass = typeof expected === 'string' ? text === expected : expected.test(text);
    const wanted = typeof expected === 'string' ? this.repr(expected) : String(expected);
    this.assert(
      pass,
      `Expected MCP text ${this.notStr} to be ${wanted} but got ${this.repr(text)}`,
    );
  }

  // ── Error assertions ──

  /** Assert that a function throws. If errClass is provided, check the error type. */
  toThrow(errClassOrMsg?: (new (...args: any[]) => Error) | string): void {
    if (typeof this.actual !== 'function') {
      throw new AssertionError('Expected a function for .toThrow()');
    }
    let threw = false;
    let thrownError: unknown = null;
    try {
      (this.actual as Function)();
    } catch (e) {
      threw = true;
      thrownError = e;
    }
    this.assertThrow(threw, thrownError, errClassOrMsg);
  }

  /** Assert that an async function rejects. */
  async toThrowAsync(errClassOrMsg?: (new (...args: any[]) => Error) | string): Promise<void> {
    if (typeof this.actual !== 'function') {
      throw new AssertionError('Expected a function for .toThrowAsync()');
    }
    let threw = false;
    let thrownError: unknown = null;
    try {
      await (this.actual as Function)();
    } catch (e) {
      threw = true;
      thrownError = e;
    }
    this.assertThrow(threw, thrownError, errClassOrMsg, true);
  }

  private assertThrow(
    threw: boolean,
    thrownError: unknown,
    errClassOrMsg?: (new (...args: any[]) => Error) | string,
    async = false,
  ): void {
    const kind = async ? 'async function' : 'function';
    if (!threw) {
      this.assert(false, `Expected ${kind} to throw${this.notStr} but it did not throw`);
      return;
    }
    if (!errClassOrMsg) {
      this.assert(threw, `Expected ${kind} to throw${this.notStr} but it did not throw`);
    } else if (typeof errClassOrMsg === 'function') {
      this.assert(
        thrownError instanceof errClassOrMsg,
        `Expected ${kind} to throw ${errClassOrMsg.name}${this.notStr}` +
        ` but got ${(thrownError as Error)?.constructor?.name ?? typeof thrownError}`,
      );
    } else {
      const msg = thrownError instanceof Error ? thrownError.message : String(thrownError);
      this.assert(
        msg.includes(errClassOrMsg),
        `Expected error message to contain ${JSON.stringify(errClassOrMsg)}${this.notStr} but got ${JSON.stringify(msg)}`,
      );
    }
  }

  // ── Internal ──

  protected get notStr(): string {
    return this.isNot ? ' (not)' : '';
  }

  protected assert(pass: boolean, message: string): void {
    const finalPass = this.isNot ? !pass : pass;
    if (!finalPass) {
      throw new AssertionError(message);
    }
  }

  protected repr(val: unknown): string {
    if (val === null) return 'null';
    if (val === undefined) return 'undefined';
    if (typeof val === 'string') return JSON.stringify(val);
    if (typeof val === 'number' || typeof val === 'boolean') return String(val);
    if (Array.isArray(val)) return `[${val.map(v => this.repr(v)).join(', ')}]`;
    try {
      return JSON.stringify(val, null, 0);
    } catch {
      return String(val);
    }
  }
}

/** Patterns that identify cobasaja internal stack frames */
const INTERNAL_STACK_RE = /[/\\](?:dist|src)[/\\](?:matchers|api|runner|snapshot|client|utils|cli|index)\.(?:js|ts|mjs|cjs)/;

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
    if (typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, AssertionError);
    }
    if (this.stack) {
      this.stack = cleanStack(this.stack);
    }
  }
}

/** Strip cobasaja internals from a stack trace, keeping user/test frames. */
export function cleanStack(stack: string): string {
  const lines = stack.split('\n');
  if (lines.length === 0) return stack;
  const header = lines[0];
  const frames = lines.slice(1).filter((line) => {
    // Keep non-frame lines
    if (!/^\s+at\s/.test(line)) return true;
    // Drop cobasaja package internals (but keep tests/)
    if (INTERNAL_STACK_RE.test(line) && !/[/\\]tests[/\\]/.test(line)) return false;
    // Drop node:internal frames that clutter output
    if (/node:internal/.test(line)) return false;
    return true;
  });
  return [header, ...frames].join('\n');
}

/** Create an expectation */
export function expect<T>(actual: T): Expectation<T> {
  return new Expectation(actual);
}
