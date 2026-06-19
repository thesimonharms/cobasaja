/**
 * cobasaja — deterministic MCP testing framework.
 *
 * Public API exports.
 *
 * Usage:
 *   import { defineServer, describe, it, test, expect } from 'cobasaja';
 *
 *   defineServer({ command: 'node', args: ['./dist/index.js'] });
 *
 *   it('greets the user', async ({ tools, call }) => {
 *     expect(tools).toHaveTool('greet');
 *     const r = await call('greet', { name: 'World' });
 *     expect(r).toBeSuccessful();
 *   });
 *
 *   describe('calculator', () => {
 *     it('adds two numbers', async ({ call }) => {
 *       const r = await call('add', { a: 1, b: 2 });
 *       expect(r.text).toBe('3');
 *     });
 *   });
 */

export { defineServer, describe, it, test, expect, beforeAll, afterAll, beforeEach, afterEach } from './api.js';
export type { TestContext } from './api.js';
export type { McpServerConfig, McpToolDefinition, McpToolResult, McpClient } from './client.js';
export { AssertionError } from './matchers.js';
