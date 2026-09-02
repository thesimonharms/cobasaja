# cobasaja

> *Just try it* — a deterministic MCP testing framework for TypeScript.

**cobasaja** spawns MCP servers over stdio and runs Pest-like `describe`/`it` tests against them. Built for AI-agent tooling where reliability matters.

## v1.2.0 What's New

- **`result.text`** — tool, resource, and prompt results expose concatenated text parts
- **Resources and prompts** — `resources`, `readResource()`, `prompts`, `getPrompt()` on test context
- **MCP matchers** — `toHaveText`, `toHaveResource`, `toHavePrompt`, plus `toMatch` for regexes
- **Hooks get context** — `beforeEach` / `afterEach` / `beforeAll` / `afterAll` receive the same `{ tools, call, ... }` object
- **CLI file paths** — `npx cobasaja tests/foo.test.ts` or a directory
- **`--reporter json`** — machine-readable results for CI
- **`--version`** — print the installed version

## v1.1.0

- TypeScript test loading, nested `describe`, multiple hooks, skip/only, timeouts, `--grep` / `--bail`
- Hardened MCP client, smarter snapshots, cleaner assertion stacks

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
    expect(result).toHaveText(/ok|done/i);
    expect(result.text).toContain('bar');
  });
});

it('can read resources and prompts', async ({ resources, readResource, prompts, getPrompt }) => {
  expect(resources).toHaveResource('my://doc');
  expect(await readResource('my://doc')).toHaveText(/expected/);
  expect(prompts).toHavePrompt('draft');
  const prompt = await getPrompt('draft', { topic: 'MCP' });
  expect(prompt.text).toMatch(/MCP/);
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
npx cobasaja tests/foo.test.ts   # Run one file
npx cobasaja tests/mcp           # Discover under a directory
npx cobasaja --update            # Update snapshots
npx cobasaja --root ./tests      # Limit discovery root
npx cobasaja --grep "echo"       # Only matching tests
npx cobasaja --timeout 5000      # Default per-test timeout (ms)
npx cobasaja --bail              # Stop after first failure
npx cobasaja --verbose           # Full error output
npx cobasaja --reporter json     # Machine-readable report
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
({ tools, resources, prompts, call, readResource, getPrompt, client, snapshot }) => {
  // tools / resources / prompts — lists fetched at connect
  // call(name, args) — call a tool; result.text is concatenated text parts
  // readResource(uri) / getPrompt(name, args)
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
| `.toMatch(regex)` | String matches a RegExp (or regexp source string) |
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
| `.toHaveResource(uriOrName)` | Resource exists by URI or name |
| `.toHavePrompt(name)` | Prompt exists by name |
| `.toHaveText(str\|regex)` | MCP result/resource/prompt text equals or matches |
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

Lifecycle hooks, scoped to the enclosing `describe` block. Multiple hooks of the same type are supported and run in registration order. Nested blocks inherit parent `beforeEach`/`afterEach`. Each hook receives the same test context as `it` (so you can call tools or seed server state).

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
