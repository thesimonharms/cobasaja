# cobasaja

> *Just try it* — a deterministic MCP testing framework for TypeScript.

**cobasaja** spawns MCP servers over stdio and runs Pest-like `describe`/`it` tests against them. Built for AI-agent tooling where reliability matters.

## v1.1.0 What's New

- **TypeScript test loading** — `.test.ts` files run directly via `tsx` (no manual compile step)
- **Nested `describe`** — proper nesting with inherited hooks, preserving definition order
- **Multiple hooks** — register any number of `beforeAll` / `beforeEach` / `afterAll` / `afterEach`
- **`it.skip` / `it.only` / `describe.skip` / `describe.only`** — focus and skip support
- **Test timeouts** — per-test and global `--timeout`, with clear timeout errors
- **`--grep` / `--bail`** — filter tests by name; stop on first failure
- **Hardened MCP client** — spawn error handling, stdin safety, reliable process cleanup
- **Smart snapshots** — keys use the full describe › test path; stable key ordering
- **Cleaner errors** — assertion stacks stripped of cobasaja internals

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

**cobasaja** auto-discovers test files matching `**/*.{test,spec}.{ts,mts,js,mjs}` in the project root. Results are reported with pass/fail/skip counts and timing.

```bash
npx cobasaja                     # Run all tests
npx cobasaja --update            # Update snapshots
npx cobasaja --root ./tests      # Limit discovery root
npx cobasaja --grep "echo"       # Only matching tests
npx cobasaja --timeout 5000      # Default per-test timeout (ms)
npx cobasaja --bail              # Stop after first failure
npx cobasaja --verbose           # Full error output
```

## API

### `defineServer(config)`

Configure the MCP server under test. Optional — omit it for pure unit tests.

| Option | Type | Default | Description |
|---|---|---|---|
| `command` | `string` | — | Server binary/command |
| `args` | `string[]` | `[]` | CLI arguments |
| `timeout` | `number` | `10000` | Per-call timeout (ms) |
| `cwd` | `string` | — | Working directory for the server |
| `env` | `Record<string,string>` | — | Extra env vars (merged with `process.env`) |

### `describe(name, fn)`

Group tests into a named block. Supports nesting. Nested blocks inherit parent `beforeEach`/`afterEach` hooks. Also: `describe.skip`, `describe.only`.

### `it(name, fn, options?)`

Define a test case. `options` may be a timeout number or `{ timeout, skip, only }`. Also: `it.skip`, `it.only`, and `test` as an alias.

The async callback receives a context object:

```ts
({ tools, call, client, snapshot }) => {
  // tools — the full listTools() response array
  // call(name, args) — call a tool and return the MCP result
  // client — the raw McpClient (null in unit-test mode)
  // snapshot(value) — write/compare a named snapshot for this test
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
| `.toMatchSnapshot(name?)` | Golden-file snapshot (auto-keyed by test name) |

**Assertions on functions:**

| Matcher | Description |
|---|---|
| `.toThrow()` | Function throws |
| `.toThrow(ErrorClass)` | Throws specific error type |
| `.toThrow(msg)` | Throws with matching message |
| `.toThrowAsync()` | Async function rejects |
| `.toThrowAsync(ErrorClass)` | Async function rejects specific error type |
| `.toThrowAsync(msg)` | Async function rejects with matching message |

**`.not`** — inverts any matcher: `expect(x).not.toBe(y)`

### `beforeAll(fn)` / `afterAll(fn)` / `beforeEach(fn)` / `afterEach(fn)`

Lifecycle hooks, scoped to the enclosing `describe` block. Multiple hooks of the same type are supported and run in registration order. Nested blocks inherit parent `beforeEach`/`afterEach`.

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
