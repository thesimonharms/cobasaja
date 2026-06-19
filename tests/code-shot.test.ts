/**
 * Test code-shot MCP server using cobasaja.
 * Run: node dist/cli.js --root .
 */

import { defineServer, describe, it, expect } from '../dist/index.js';

defineServer({
  command: 'node',
  args: ['/home/lekmon/code-shot/dist/index.js'],
  timeout: 30000,
});

it('lists expected tools', async ({ tools }) => {
  expect(tools).toHaveTool('render_code');
  expect(tools).toHaveTool('render_diff');
  expect(tools.length).toBe(2);
});

describe('render_code', () => {
  it('renders a simple code snippet as SVG', async ({ call }) => {
    const result = await call('render_code', {
      code: 'const x = 42;',
      language: 'javascript',
      theme: 'github-dark',
    });
    expect(result).toBeSuccessful();
    expect(result.content[0].text).toBeDefined();
    expect(result.content[0].text).toContain('<svg');
  });

  it('renders with nord theme', async ({ call }) => {
    const result = await call('render_code', {
      code: 'fn main() {}',
      language: 'rust',
      theme: 'nord',
    });
    expect(result).toBeSuccessful();
    expect(result.content[0].text).toContain('#2e3440');
  });

  it('renders with window title', async ({ call }) => {
    const result = await call('render_code', {
      code: 'package main',
      language: 'go',
      theme: 'dracula',
      title: 'hello.go',
    });
    expect(result).toBeSuccessful();
    expect(result.content[0].text).toContain('hello.go');
  });
});

describe('render_diff', () => {
  it('renders a git diff with add/del colors', async ({ call }) => {
    const result = await call('render_diff', {
      diff: [
        '@@ -1,3 +1,4 @@',
        ' a',
        '-b',
        '+c',
        ' d',
      ].join('\n'),
      theme: 'github-dark',
    });
    expect(result).toBeSuccessful();
    const svg = result.content[0].text;
    expect(svg).toContain('#1b4520');
    expect(svg).toContain('#4f1818');
    expect(svg).toContain('#1a2332');
  });
});
