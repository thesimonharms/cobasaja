/**
 * Unit tests for cobasaja's own modules — utils, matchers, snapshot.
 * These import the compiled dist module directly, no MCP server needed.
 */

import { deepEqual, matchObject } from '../dist/utils.js';
import { describe, it, expect, AssertionError } from '../dist/index.js';

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

  it('passes when no error thrown (inverted)', async () => {
    expect(() => { /* no throw */ }).not.toThrow(AssertionError);
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
