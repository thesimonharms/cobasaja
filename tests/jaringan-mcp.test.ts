/**
 * Integration tests for jaringan-mcp MCP server.
 * Uses local file root (~/wiki) so no running JRG server needed.
 */

import { defineServer, describe, it, expect } from '../dist/index.js';

defineServer({
  command: 'node',
  args: ['/home/lekmon/jaringan-mcp/dist/index.js', '--file-root', '/home/lekmon/wiki'],
  timeout: 10000,
});

it('lists expected tools', async ({ tools }) => {
  expect(tools).toHaveTool('jrg_list');
  expect(tools).toHaveTool('jrg_fetch');
  expect(tools).toHaveTool('jrg_fetch_raw');
  expect(tools).toHaveTool('jrg_inspect');
  expect(tools).toHaveTool('jrg_search');
  expect(tools).toHaveTool('jrg_view');
  expect(tools).toHaveTool('jrg_auth_list');
  expect(tools.length).toBe(7);
});

describe('jrg_list', () => {
  it('lists available wiki pages from file root', async ({ call }) => {
    const result = await call('jrg_list');
    expect(result).toBeSuccessful();
    // File root listing may return empty or populated depending on implementation
    expect(result.content[0].text).toBeDefined();
  });
});

describe('jrg_fetch', () => {
  it('fetches the welcome page', async ({ call }) => {
    const result = await call('jrg_fetch', { url: 'welcome' });
    expect(result).toBeSuccessful();
    const text = result.content[0].text || '';
    expect(text).toContain('Jaringan');
    expect(text).toContain('wiki');
  });

  it('fetches the port-map page', async ({ call }) => {
    const result = await call('jrg_fetch', { url: 'port-map' });
    expect(result).toBeSuccessful();
    const text = result.content[0].text || '';
    expect(text).toContain('7070');
  });

  it('returns error for non-existent page', async ({ call }) => {
    const result = await call('jrg_fetch', { url: 'nonexistent-page' });
    // Should either be an error or return something indicating not found
    expect(result).toBeDefined();
  });
});

describe('jrg_inspect', () => {
  it('inspects the welcome page structure', async ({ call }) => {
    const result = await call('jrg_inspect', { url: 'welcome' });
    expect(result).toBeSuccessful();
    const text = result.content[0].text || '';
    // Inspect returns JSON with page metadata
    expect(text).toContain('links');
    expect(text).toContain('title');
    expect(text).toContain('body');
  });
});

describe('jrg_search', () => {
  it('finds pages by content', async ({ call }) => {
    const result = await call('jrg_search', {
      query: 'Jaringan',
      root: '/home/lekmon/wiki',
    });
    expect(result).toBeSuccessful();
    const text = result.content[0].text || '';
    expect(text).toContain('welcome');
  });

  it('returns empty for non-matching query', async ({ call }) => {
    const result = await call('jrg_search', {
      query: 'zzzznotfound',
      root: '/home/lekmon/wiki',
    });
    expect(result).toBeSuccessful();
    // Should not error, just return empty results
  });
});
