/**
 * Unit tests for cobasaja's own modules — utils, matchers, snapshot, runner.
 * These import the compiled dist module directly, no MCP server needed.
 */

import { deepEqual, matchObject, withTimeout } from '../dist/utils.js';
import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  AssertionError,
} from '../dist/index.js';
import { cleanStack, textOf } from '../dist/matchers.js';
import { extractText } from '../dist/client.js';

// ── deepEqual ────────────────────────────────────────────────────────────────

describe('deepEqual', () => {
  it('compares primitives', async () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
    expect(deepEqual('a', 'a')).toBe(true);
    expect(deepEqual('a', 'b')).toBe(false);
    expect(deepEqual(true, true)).toBe(true);
    expect(deepEqual(true, false)).toBe(false);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(undefined, undefined)).toBe(true);
    expect(deepEqual(null, undefined)).toBe(false);
  });

  it('handles NaN via Object.is', async () => {
    expect(deepEqual(NaN, NaN)).toBe(true);
    expect(deepEqual(0, -0)).toBe(false);
  });

  it('compares arrays', async () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2, 3], [1, 2])).toBe(false);
    expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false);
    expect(deepEqual([], [])).toBe(true);
    expect(deepEqual([{ a: 1 }], [{ a: 1 }])).toBe(true);
    expect(deepEqual([{ a: 1 }], [{ a: 2 }])).toBe(false);
  });

  it('compares objects', async () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1, b: 2 })).toBe(true);
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(deepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
  });

  it('compares dates and regexes', async () => {
    expect(deepEqual(new Date('2020-01-01'), new Date('2020-01-01'))).toBe(true);
    expect(deepEqual(new Date('2020-01-01'), new Date('2020-01-02'))).toBe(false);
    expect(deepEqual(/ab/g, /ab/g)).toBe(true);
    expect(deepEqual(/ab/g, /ab/i)).toBe(false);
  });

  it('treats same reference as equal', async () => {
    const obj = { a: 1 };
    expect(deepEqual(obj, obj)).toBe(true);
  });
});

// ── matchObject ──────────────────────────────────────────────────────────────

describe('matchObject', () => {
  it('matches subset of keys', async () => {
    expect(matchObject({ a: 1, b: 2, c: 3 }, { a: 1, b: 2 })).toBe(true);
    expect(matchObject({ a: 1, b: 2 }, { a: 1, b: 2, c: 3 })).toBe(false);
  });

  it('matches deeply nested subsets', async () => {
    expect(matchObject({ a: { b: { c: 1 } }, x: 2 }, { a: { b: { c: 1 } } })).toBe(true);
    expect(matchObject({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } })).toBe(false);
  });

  it('returns false for non-objects', async () => {
    expect(matchObject(null, { a: 1 })).toBe(false);
    expect(matchObject(42, {})).toBe(false);
  });
});

// ── withTimeout ──────────────────────────────────────────────────────────────

describe('withTimeout', () => {
  it('resolves when promise finishes in time', async () => {
    const value = await withTimeout(Promise.resolve(42), 1000);
    expect(value).toBe(42);
  });

  it('rejects when promise exceeds timeout', async () => {
    await expect(async () => {
      await withTimeout(new Promise(() => {}), 20, 'slow op');
    }).toThrowAsync('timed out');
  });
});

// ── Expectation ──────────────────────────────────────────────────────────────

describe('expect().toBe', () => {
  it('passes on strict equality', async () => {
    expect(() => expect(42).toBe(42)).not.toThrow();
    expect(() => expect('hello').toBe('hello')).not.toThrow();
    expect(() => expect(true).toBe(true)).not.toThrow();
  });

  it('throws on mismatch', async () => {
    expect(() => expect(42).toBe(43)).toThrow(AssertionError);
    expect(() => expect('a').toBe('b')).toThrow(AssertionError);
  });
});

describe('expect().toEqual', () => {
  it('passes on deep equality', async () => {
    expect(() => expect({ a: 1, b: [2, 3] }).toEqual({ a: 1, b: [2, 3] })).not.toThrow();
    expect(() => expect([1, { x: 2 }]).toEqual([1, { x: 2 }])).not.toThrow();
  });

  it('throws on deep mismatch', async () => {
    expect(() => expect({ a: 1 }).toEqual({ a: 2 })).toThrow(AssertionError);
    expect(() => expect([1, 2]).toEqual([1, 3])).toThrow(AssertionError);
  });
});

describe('expect().toContain', () => {
  it('checks string containment', async () => {
    expect(() => expect('hello world').toContain('world')).not.toThrow();
    expect(() => expect('hello world').toContain('xyz')).toThrow(AssertionError);
  });

  it('checks array containment', async () => {
    expect(() => expect([1, 2, 3]).toContain(2)).not.toThrow();
    expect(() => expect([1, 2, 3]).toContain(4)).toThrow(AssertionError);
    expect(() => expect([{ a: 1 }]).toContain({ a: 1 })).not.toThrow();
  });
});

describe('expect().toBeDefined / toBeUndefined', () => {
  it('toBeDefined', async () => {
    expect(() => expect('hello').toBeDefined()).not.toThrow();
    expect(() => expect(undefined).toBeDefined()).toThrow(AssertionError);
  });

  it('toBeUndefined', async () => {
    expect(() => expect(undefined).toBeUndefined()).not.toThrow();
    expect(() => expect(null).toBeUndefined()).toThrow(AssertionError);
  });
});

describe('expect().toBeTruthy / toBeFalsy', () => {
  it('toBeTruthy', async () => {
    expect(() => expect(1).toBeTruthy()).not.toThrow();
    expect(() => expect(0).toBeTruthy()).toThrow(AssertionError);
    expect(() => expect('').toBeTruthy()).toThrow(AssertionError);
  });

  it('toBeFalsy', async () => {
    expect(() => expect(0).toBeFalsy()).not.toThrow();
    expect(() => expect('').toBeFalsy()).not.toThrow();
    expect(() => expect(1).toBeFalsy()).toThrow(AssertionError);
  });
});

describe('expect().toMatchObject', () => {
  it('matches partial objects', async () => {
    expect(() => expect({ a: 1, b: 2, c: 3 }).toMatchObject({ a: 1, b: 2 })).not.toThrow();
    expect(() => expect({ a: 1 }).toMatchObject({ a: 1, b: 2 })).toThrow(AssertionError);
  });

  it('matches nested partial objects', async () => {
    expect(() => expect({ user: { name: 'Alice', age: 30 } }).toMatchObject({ user: { name: 'Alice' } })).not.toThrow();
    expect(() => expect({ user: { name: 'Alice' } }).toMatchObject({ user: { name: 'Alice', age: 30 } })).toThrow(AssertionError);
  });
});

describe('expect().toHaveLength', () => {
  it('checks array length', async () => {
    expect(() => expect([1, 2, 3]).toHaveLength(3)).not.toThrow();
    expect(() => expect([1, 2, 3]).toHaveLength(2)).toThrow(AssertionError);
    expect(() => expect('abc').toHaveLength(3)).not.toThrow();
  });
});

describe('expect().toBeNull', () => {
  it('passes for null', async () => {
    expect(() => expect(null).toBeNull()).not.toThrow();
    expect(() => expect(undefined).toBeNull()).toThrow(AssertionError);
    expect(() => expect(0).toBeNull()).toThrow(AssertionError);
  });
});

// ── MCP-specific matchers ───────────────────────────────────────────────────

describe('expect().toHaveTool', () => {
  const tools = [
    { name: 'greet', description: 'Says hello' },
    { name: 'add', description: 'Adds numbers' },
  ];

  it('passes when tool exists', async () => {
    expect(() => expect(tools).toHaveTool('greet')).not.toThrow();
    expect(() => expect(tools).toHaveTool('add')).not.toThrow();
  });

  it('throws when tool is missing', async () => {
    expect(() => expect(tools).toHaveTool('missing')).toThrow(AssertionError);
  });
});

describe('expect().toBeSuccessful', () => {
  it('passes on successful MCP result', async () => {
    expect(() => expect({ content: [{ type: 'text', text: 'ok' }] }).toBeSuccessful()).not.toThrow();
    expect(() => expect({ content: [], isError: false }).toBeSuccessful()).not.toThrow();
  });

  it('fails on errored MCP result', async () => {
    expect(() => expect({ content: [], isError: true }).toBeSuccessful()).toThrow(AssertionError);
  });
});

describe('expect().toMatch', () => {
  it('matches strings against regexes', async () => {
    expect(() => expect('hello world').toMatch(/world/)).not.toThrow();
    expect(() => expect('hello world').toMatch('hel+o')).not.toThrow();
    expect(() => expect('hello world').toMatch(/xyz/)).toThrow(AssertionError);
  });
});

describe('expect().toHaveText / toHaveResource / toHavePrompt', () => {
  it('toHaveText reads MCP content parts', async () => {
    const result = { content: [{ type: 'text', text: 'hello' }] };
    expect(() => expect(result).toHaveText('hello')).not.toThrow();
    expect(() => expect(result).toHaveText(/ell/)).not.toThrow();
    expect(() => expect(result).toHaveText('nope')).toThrow(AssertionError);
  });

  it('toHaveResource matches uri or name', async () => {
    const resources = [{ uri: 'memo://hello', name: 'hello' }];
    expect(() => expect(resources).toHaveResource('memo://hello')).not.toThrow();
    expect(() => expect(resources).toHaveResource('hello')).not.toThrow();
    expect(() => expect(resources).toHaveResource('missing')).toThrow(AssertionError);
  });

  it('toHavePrompt matches name', async () => {
    const prompts = [{ name: 'greet' }];
    expect(() => expect(prompts).toHavePrompt('greet')).not.toThrow();
    expect(() => expect(prompts).toHavePrompt('missing')).toThrow(AssertionError);
  });
});

describe('extractText / textOf', () => {
  it('joins text content parts', async () => {
    expect(extractText([{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }])).toBe('a\nb');
    expect(extractText([{ type: 'image', data: 'xx' }])).toBe('');
    expect(textOf({ content: [{ type: 'text', text: 'hi' }] })).toBe('hi');
    expect(textOf({ contents: [{ type: 'text', text: 'res' }] })).toBe('res');
    expect(textOf('plain')).toBe('plain');
  });
});

describe('expect().toHaveErrored', () => {
  it('passes on errored MCP result', async () => {
    expect(() => expect({ content: [], isError: true }).toHaveErrored()).not.toThrow();
  });

  it('fails on successful result', async () => {
    expect(() => expect({ content: [{ type: 'text', text: 'ok' }] }).toHaveErrored()).toThrow(AssertionError);
  });
});

// ── .not modifier ────────────────────────────────────────────────────────────

describe('expect().not', () => {
  it('inverts .toBe', async () => {
    expect(() => expect(42).not.toBe(43)).not.toThrow();
    expect(() => expect(42).not.toBe(42)).toThrow(AssertionError);
  });

  it('inverts .toContain', async () => {
    expect(() => expect('hello').not.toContain('xyz')).not.toThrow();
    expect(() => expect('hello').not.toContain('hello')).toThrow(AssertionError);
  });

  it('inverts .toHaveTool', async () => {
    const tools = [{ name: 'greet' }];
    expect(() => expect(tools).not.toHaveTool('missing')).not.toThrow();
    expect(() => expect(tools).not.toHaveTool('greet')).toThrow(AssertionError);
  });

  it('inverts .toBeSuccessful', async () => {
    expect(() => expect({ isError: true }).not.toBeSuccessful()).not.toThrow();
    expect(() => expect({}).not.toBeSuccessful()).toThrow(AssertionError);
  });
});

// ── Error assertions (expect(fn).toThrow) ────────────────────────────────────

describe('expect(fn).toThrow', () => {
  it('catches thrown errors', async () => {
    expect(() => { throw new AssertionError('boom'); }).toThrow(AssertionError);
    expect(() => { throw new Error('boom'); }).toThrow(Error);
  });

  it('matches error message strings', async () => {
    expect(() => { throw new Error('not found'); }).toThrow('not found');
  });

  it('passes when no error thrown (inverted)', async () => {
    expect(() => { /* no throw */ }).not.toThrow(AssertionError);
  });
});

// ── AssertionError stack cleaning ────────────────────────────────────────────

describe('AssertionError stack cleaning', () => {
  it('excludes cobasaja internal frames', async () => {
    try {
      expect(1).toBe(2);
    } catch (e: any) {
      const stack = e.stack || '';
      // Should NOT contain cobasaja src/dist matcher paths
      expect(stack.includes('matchers.ts')).toBe(false);
      expect(stack.includes('matchers.js')).toBe(false);
      // SHOULD contain the test file
      expect(stack.includes('cobasaja.test.ts')).toBe(true);
    }
  });

  it('cleanStack helper strips internals', async () => {
    const raw = [
      'AssertionError: boom',
      '    at assert (/workspace/dist/matchers.js:10:5)',
      '    at Object.<anonymous> (/workspace/tests/cobasaja.test.ts:12:3)',
      '    at processTicksAndRejections (node:internal/process/task_queues:95:5)',
    ].join('\n');
    const cleaned = cleanStack(raw);
    expect(cleaned.includes('matchers.js')).toBe(false);
    expect(cleaned.includes('cobasaja.test.ts')).toBe(true);
    expect(cleaned.includes('node:internal')).toBe(false);
  });
});

// ── Async Error assertions (expect(fn).toThrowAsync) ─────────────────────────

describe('expect(fn).toThrowAsync', () => {
  it('catches async thrown errors', async () => {
    await expect(async () => { throw new AssertionError('boom'); }).toThrowAsync(AssertionError);
    await expect(async () => { throw new Error('boom'); }).toThrowAsync(Error);
  });

  it('fails when async function does not throw', async () => {
    await expect(async () => { /* no throw */ }).not.toThrowAsync(AssertionError);
  });

  it('matches error message', async () => {
    await expect(async () => { throw new Error('not found'); }).toThrowAsync('not found');
    await expect(async () => { throw new Error('not found'); }).not.toThrowAsync('timeout');
  });
});

// ── Numeric matchers ──────────────────────────────────────────────────────────

describe('expect().toBeGreaterThan / toBeLessThan', () => {
  it('toBeGreaterThan', async () => {
    expect(() => expect(5).toBeGreaterThan(3)).not.toThrow();
    expect(() => expect(3).toBeGreaterThan(5)).toThrow(AssertionError);
    expect(() => expect(3).toBeGreaterThan(3)).toThrow(AssertionError);
  });
  it('toBeGreaterThanOrEqual', async () => {
    expect(() => expect(5).toBeGreaterThanOrEqual(3)).not.toThrow();
    expect(() => expect(3).toBeGreaterThanOrEqual(3)).not.toThrow();
    expect(() => expect(2).toBeGreaterThanOrEqual(3)).toThrow(AssertionError);
  });
  it('toBeLessThan', async () => {
    expect(() => expect(3).toBeLessThan(5)).not.toThrow();
    expect(() => expect(5).toBeLessThan(3)).toThrow(AssertionError);
    expect(() => expect(3).toBeLessThan(3)).toThrow(AssertionError);
  });
  it('toBeLessThanOrEqual', async () => {
    expect(() => expect(3).toBeLessThanOrEqual(5)).not.toThrow();
    expect(() => expect(3).toBeLessThanOrEqual(3)).not.toThrow();
    expect(() => expect(5).toBeLessThanOrEqual(3)).toThrow(AssertionError);
  });
});

describe('expect().toBeCloseTo', () => {
  it('compares floating point numbers', async () => {
    expect(() => expect(0.1 + 0.2).toBeCloseTo(0.3)).not.toThrow();
    expect(() => expect(0.1 + 0.2).toBeCloseTo(0.3, 17)).toThrow(AssertionError);
    expect(() => expect(1.0).toBeCloseTo(1.001, 2)).not.toThrow();
    expect(() => expect(1.1).toBeCloseTo(1.0, 1)).toThrow(AssertionError);
  });
});

// ── Nested describe + hooks ──────────────────────────────────────────────────

describe('nested describe and hooks', () => {
  const order: string[] = [];

  beforeAll(() => { order.push('outer:beforeAll'); });
  afterAll(() => { order.push('outer:afterAll'); });
  beforeEach(() => { order.push('outer:beforeEach'); });
  afterEach(() => { order.push('outer:afterEach'); });

  it('runs outer hooks', async () => {
    order.push('outer:test');
    expect(order[0]).toBe('outer:beforeAll');
    expect(order).toContain('outer:beforeEach');
  });

  describe('inner', () => {
    beforeAll(() => { order.push('inner:beforeAll'); });
    beforeEach(() => { order.push('inner:beforeEach'); });
    afterEach(() => { order.push('inner:afterEach'); });
    afterAll(() => { order.push('inner:afterAll'); });

    it('inherits parent hooks', async () => {
      order.push('inner:test');
      expect(order).toContain('outer:beforeAll');
      expect(order).toContain('inner:beforeAll');
      expect(order).toContain('outer:beforeEach');
      expect(order).toContain('inner:beforeEach');
    });
  });

  it('records hook order across nesting', async () => {
    // By the time this runs, inner block should have completed
    expect(order).toContain('inner:afterAll');
    expect(order.indexOf('outer:beforeAll')).toBeLessThan(order.indexOf('inner:beforeAll'));
  });
});

describe('test context in unit mode', () => {
  it('provides empty MCP collections and no client', async (ctx) => {
    expect(ctx.tools).toEqual([]);
    expect(ctx.resources).toEqual([]);
    expect(ctx.prompts).toEqual([]);
    expect(ctx.client).toBeNull();
  });

  it('call() explains that no server is configured', async ({ call }) => {
    await expect(async () => { await call('echo'); }).toThrowAsync('defineServer');
  });
});

// ── Multiple hooks ───────────────────────────────────────────────────────────

describe('multiple hooks of the same type', () => {
  const calls: string[] = [];

  beforeEach(() => { calls.push('a'); });
  beforeEach(() => { calls.push('b'); });

  it('runs all beforeEach hooks in order', async () => {
    expect(calls).toEqual(['a', 'b']);
  });
});

// ── Snapshots ────────────────────────────────────────────────────────────────

describe('snapshots', () => {
  it('creates and matches a snapshot by test name', async () => {
    expect({ hello: 'world', n: 1 }).toMatchSnapshot();
  });

  it('supports explicit snapshot names', async () => {
    expect([1, 2, 3]).toMatchSnapshot('explicit-list');
  });
});

// ── it.skip ──────────────────────────────────────────────────────────────────

describe('skip support', () => {
  it.skip('is skipped and does not fail', async () => {
    expect(true).toBe(false);
  });

  it('still runs sibling tests', async () => {
    expect(true).toBe(true);
  });
});
