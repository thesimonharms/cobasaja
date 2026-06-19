/**
 * Expectation/assertion system inspired by Jest/Vitest.
 * Supports chaining, `.not` modifier, and MCP-specific matchers.
 */

import { deepEqual, matchObject } from './utils.js';

export class Expectation<T> {
  protected actual: T;
  private isNot: boolean;

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
      typeof actual === 'number' && diff < precision,
      `Expected ${actual} to be close to ${expected} (within ${numDigits} decimal places)${this.notStr}`,
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

  // ── Error assertions ──

  /** Assert that a function throws. If errClass is provided, check the error type. */
  toThrow(errClass?: new (...args: any[]) => Error): void {
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
    if (errClass) {
      this.assert(
        threw && thrownError instanceof errClass,
        `Expected function to throw ${errClass.name}${this.notStr}` +
        (threw ? ` but got ${(thrownError as Error).constructor.name}` : ' (did not throw)'),
      );
    } else {
      this.assert(
        threw,
        `Expected function to throw${this.notStr} but it did not throw`,
      );
    }
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
    if (!threw) {
      this.assert(false, `Expected async function to throw${this.notStr} but it did not throw`);
      return;
    }
    if (!errClassOrMsg) {
      this.assert(threw, `Expected async function to throw${this.notStr} but it did not throw`);
    } else if (typeof errClassOrMsg === 'function') {
      this.assert(
        threw && thrownError instanceof errClassOrMsg,
        `Expected async function to throw ${errClassOrMsg.name}${this.notStr}` +
        (threw ? ` but got ${(thrownError as Error).constructor.name}` : ' (did not throw)'),
      );
    } else if (typeof errClassOrMsg === 'string') {
      const msg = thrownError instanceof Error ? thrownError.message : String(thrownError);
      this.assert(
        msg.includes(errClassOrMsg),
        `Expected error message to contain ${JSON.stringify(errClassOrMsg)}${this.notStr} but got ${JSON.stringify(msg)}`,
      );
    }
  }

  // ── Internal ──

  private get notStr(): string {
    return this.isNot ? ' (not)' : '';
  }

  private assert(pass: boolean, message: string): void {
    const finalPass = this.isNot ? !pass : pass;
    if (!finalPass) {
      throw new AssertionError(message);
    }
  }

  private repr(val: unknown): string {
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

export class AssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssertionError';
  }
}

/** Create an expectation */
export function expect<T>(actual: T): Expectation<T> {
  return new Expectation(actual);
}
