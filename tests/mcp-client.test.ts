/**
 * Integration tests for McpClient against a tiny mock MCP stdio server.
 */

import { describe, it, expect, beforeAll, afterAll } from '../dist/index.js';
import { McpClient } from '../dist/client.js';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const mockServerPath = join(tmpdir(), `cobasaja-mock-mcp-${process.pid}.mjs`);

function ensureMockServer(): void {
  if (existsSync(mockServerPath)) return;
  mkdirSync(tmpdir(), { recursive: true });
  writeFileSync(mockServerPath, `
import { createInterface } from 'node:readline';

const rl = createInterface({ input: process.stdin });
const tools = [
  { name: 'echo', description: 'Echoes input', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } },
  { name: 'fail', description: 'Returns an error result' },
];

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\\n');
}

rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  if (method === 'initialize') {
    send({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: {}, serverInfo: { name: 'mock', version: '0.0.1' } } });
  } else if (method === 'notifications/initialized') {
    // no-op
  } else if (method === 'tools/list') {
    send({ jsonrpc: '2.0', id, result: { tools } });
  } else if (method === 'tools/call') {
    if (params?.name === 'echo') {
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: String(params.arguments?.text ?? '') }] } });
    } else if (params?.name === 'fail') {
      send({ jsonrpc: '2.0', id, result: { content: [{ type: 'text', text: 'boom' }], isError: true } });
    } else {
      send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Unknown tool' } });
    }
  } else if (id != null) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  }
});
`);
}

ensureMockServer();

describe('McpClient', () => {
  describe('against mock server', () => {
    let client: McpClient;

    beforeAll(async () => {
      ensureMockServer();
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

    it('calls echo successfully', async () => {
      const result = await client.callTool('echo', { text: 'hello' });
      expect(result).toBeSuccessful();
      expect(result.content[0].text).toBe('hello');
    });

    it('surfaces tool-level errors via isError', async () => {
      const result = await client.callTool('fail', {});
      expect(result).toHaveErrored();
    });

    it('rejects unknown tools with RPC error', async () => {
      await expect(async () => {
        await client.callTool('missing', {});
      }).toThrowAsync('Unknown tool');
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
