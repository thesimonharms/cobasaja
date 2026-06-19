# cobasaja

> *Just try it* — a deterministic MCP testing framework for TypeScript.

**cobasaja** spawns MCP servers over stdio and runs Pest-like `describe`/`it` tests against them. Built for AI-agent tooling where reliability matters.

## v1.0.0 What's New

- **`toThrowAsync()`** — test async error handling with error class or message matching
- **Numeric matchers** — `toBeGreaterThan`, `toBeLessThan`, `toBeGreaterThanOrEqual`, `toBeLessThanOrEqual`, `toBeCloseTo`
- **Smart snapshots** — snapshot keys now use test names instead of a hardcoded fallback (multiple snapshots per test work correctly)
- **Cleaner errors** — assertion stack traces stripped of cobasaja internals
- **`--verbose`** — detailed per-file test output flag

## Install

```bash
npm install --save-dev cobasaja
```

## Quick Start

Create a test file and run it:

```ts
// tests/my-server.test.ts
import { defineServer, describe, it, expect } from 'cobasaja';

defineServer({
  command: 'node',
  args: ['dist/index.js'],
  timeout: 10000,
});

it('lists expected tools', async ({ tools }) => {
  expect(tools).toHaveTool('my_tool');
  expect(tools.length).toBe(1);
});

describe('my_tool', () => {
  it('returns a successful result', async ({ call }) => {
    const result = await call('my_tool', { foo: 'bar' });
    expect(result).toBeSuccessful();
  });
});
```

```bash
# Run tests
npx cobasaja
```

## Test Runner

**cobasaja** auto-discovers test files matching `**/*.test.ts` in the project root. Results are reported with pass/fail counts and timing.

## API

### `defineServer(config)`

Configure the MCP server under test. Must be called once before any tests.

| Option | Type | Default | Description |
|---|---|---|---|
| `command` | `string` | — | Server binary/command |
| `args` | `string[]` | `[]` | CLI arguments |
| `timeout` | `number` | `10000` | Per-call timeout (ms) |

### `describe(name, fn)`

Group tests into a named block. Supports nested `describe`. Runs `beforeEach`/`afterEach` hooks scoped to the block, and `beforeAll`/`afterAll` hooks scoped to the block.

### `it(name, fn)`

Define a test case. The async callback receives a context object:

```ts
({ tools, call }) => {
  // tools — the full listTools() response array
  // call(name, args) — call a tool and return the MCP result
}
```

### `expect(value)`

**Matchers:**

| Matcher | Description |
|---|---|
| `.toBe(value)` | Strict equality (`===`) |
| `.toEqual(value)` | Deep equality |
| `.toContain(value)` | String or array containment |
| `.toMatchObject(obj)` | Partial object match |
| `.toHaveLength(n)` | Length check |
| `.toBeGreaterThan(n)` | Numeric: actual > expected |
| `.toBeGreaterThanOrEqual(n)` | Numeric: actual >= expected |
| `.toBeLessThan(n)` | Numeric: actual < expected |
| `.toBeLessThanOrEqual(n)` | Numeric: actual <= expected |
| `.toBeCloseTo(n, digits?)` | Floating-point comparison within precision |
| `.toBeDefined()` | Not `undefined` |
| `.toBeUndefined()` | `undefined` |
| `.toBeNull()` | `null` |
| `.toBeTruthy()` | Truthy |
| `.toBeFalsy()` | Falsy |
| `.toHaveTool(name)` | Tool exists in MCP tools array |
| `.toBeSuccessful()` | MCP result has no error |
| `.toHaveErrored()` | MCP result has error flag |

**Assertions on functions:**

| Matcher | Description |
|---|---|
| `.toThrow()` | Function throws |
| `.toThrow(ErrorClass)` | Throws specific error type |
| `.toThrowAsync()` | Async function rejects |
| `.toThrowAsync(ErrorClass)` | Async function rejects specific error type |
| `.toThrowAsync(msg)` | Async function rejects with matching message |

**`.not`** — inverts any matcher: `expect(x).not.toBe(y)`

### `beforeAll(fn)` / `afterAll(fn)` / `beforeEach(fn)` / `afterEach(fn)`

Lifecycle hooks, scoped to the enclosing `describe` block.

### Snapshots

Use `toMatchSnapshot()` for golden-file testing. Snapshots are stored in `__snapshots__/` alongside the test file and should be committed to version control.

```ts
it('produces expected output', async ({ call }) => {
  const result = await call('my_tool', {});
  expect(result).toMatchSnapshot();
});
```

## License

MIT
