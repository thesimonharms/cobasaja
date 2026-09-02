/**
 * DSL-level tests: defineServer context (call / resources / prompts / hooks).
 */

import { defineServer, describe, it, expect, beforeEach } from '../dist/index.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const mockServerPath = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'mock-mcp-server.mjs');

defineServer({
  command: 'node',
  args: [mockServerPath],
  timeout: 5000,
});

describe('defineServer context', () => {
  beforeEach(({ tools }) => {
    expect(tools).toHaveTool('echo');
  });

  it('lists tools, resources, and prompts', async ({ tools, resources, prompts }) => {
    expect(tools).toHaveTool('echo');
    expect(resources).toHaveResource('memo://hello');
    expect(prompts).toHavePrompt('greet');
  });

  it('call() returns result.text', async ({ call }) => {
    const result = await call('echo', { text: 'from context' });
    expect(result).toBeSuccessful();
    expect(result.text).toBe('from context');
    expect(result).toHaveText('from context');
    expect(result).toHaveText(/context/);
  });

  it('readResource() and getPrompt() work from context', async ({ readResource, getPrompt }) => {
    const resource = await readResource('memo://hello');
    expect(resource).toHaveText('hello from resource');

    const prompt = await getPrompt('greet', { name: 'cobasaja' });
    expect(prompt.text).toContain('cobasaja');
  });
});
