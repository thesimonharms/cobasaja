/**
 * Integration tests for McpClient against the mock MCP stdio server.
 */

import { describe, it, expect, beforeAll, afterAll } from '../dist/index.js';
import { McpClient } from '../dist/client.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const mockServerPath = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'mock-mcp-server.mjs');

describe('McpClient', () => {
  describe('against mock server', () => {
    let client: McpClient;

    beforeAll(async () => {
      client = new McpClient({
        command: 'node',
        args: [mockServerPath],
        timeout: 5000,
      });
      await client.connect();
    });

    afterAll(async () => {
      await client?.close();
    });

    it('lists tools after connect', async () => {
      expect(client.tools).toHaveLength(2);
      expect(client.tools).toHaveTool('echo');
      expect(client.tools).toHaveTool('fail');
    });

    it('lists resources and prompts after connect', async () => {
      expect(client.resources).toHaveResource('memo://hello');
      expect(client.resources).toHaveResource('hello');
      expect(client.prompts).toHavePrompt('greet');
    });

    it('calls echo successfully and exposes .text', async () => {
      const result = await client.callTool('echo', { text: 'hello' });
      expect(result).toBeSuccessful();
      expect(result.content[0].text).toBe('hello');
      expect(result.text).toBe('hello');
      expect(result).toHaveText('hello');
    });

    it('surfaces tool-level errors via isError', async () => {
      const result = await client.callTool('fail', {});
      expect(result).toHaveErrored();
      expect(result).toHaveText('boom');
    });

    it('rejects unknown tools with RPC error', async () => {
      await expect(async () => {
        await client.callTool('missing', {});
      }).toThrowAsync('Unknown tool');
    });

    it('reads a resource', async () => {
      const resource = await client.readResource('memo://hello');
      expect(resource).toHaveText('hello from resource');
      expect(resource.text).toBe('hello from resource');
    });

    it('gets a prompt with arguments', async () => {
      const prompt = await client.getPrompt('greet', { name: 'Ada' });
      expect(prompt).toHaveText('Say hello to Ada');
      expect(prompt.text).toMatch(/Ada/);
    });
  });

  describe('tools-only servers', () => {
    it('connects when resources and prompts are not advertised', async () => {
      const { writeFileSync, mkdirSync } = await import('node:fs');
      const { tmpdir } = await import('node:os');
      const path = join(tmpdir(), `cobasaja-tools-only-${process.pid}.mjs`);
      mkdirSync(tmpdir(), { recursive: true });
      writeFileSync(path, `
import { createInterface } from 'node:readline';
const rl = createInterface({ input: process.stdin });
function send(msg) { process.stdout.write(JSON.stringify(msg) + '\\n'); }
rl.on('line', (line) => {
  let msg; try { msg = JSON.parse(line); } catch { return; }
  if (msg.method === 'initialize') {
    send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'tools-only', version: '0' } } });
  } else if (msg.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: msg.id, result: { tools: [{ name: 'ping' }] } });
  } else if (msg.id != null) {
    send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found' } });
  }
});
`);
      const client = new McpClient({ command: 'node', args: [path], timeout: 4000 });
      try {
        await client.connect();
        expect(client.tools).toHaveTool('ping');
        expect(client.resources).toHaveLength(0);
        expect(client.prompts).toHaveLength(0);
      } finally {
        await client.close();
      }
    });
  });

  describe('process lifecycle', () => {
    it('fails clearly when spawning a missing binary', async () => {
      const bad = new McpClient({
        command: 'cobasaja-definitely-not-a-binary-xyz',
        args: [],
        timeout: 2000,
      });
      await expect(async () => {
        await bad.connect();
      }).toThrowAsync('Failed to spawn');
    });
  });
});
