/**
 * Tiny stdio MCP server used by cobasaja's own integration tests.
 */
import { createInterface } from 'node:readline';

const rl = createInterface({ input: process.stdin });

const tools = [
  { name: 'echo', description: 'Echoes input', inputSchema: { type: 'object', properties: { text: { type: 'string' } } } },
  { name: 'fail', description: 'Returns an error result' },
];

const resources = [
  { uri: 'memo://hello', name: 'hello', description: 'A greeting memo', mimeType: 'text/plain' },
];

const prompts = [
  { name: 'greet', description: 'Greeting prompt', arguments: [{ name: 'name', required: true }] },
];

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  const { id, method, params } = msg;
  if (method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {}, resources: {}, prompts: {} },
        serverInfo: { name: 'mock', version: '0.0.1' },
      },
    });
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
  } else if (method === 'resources/list') {
    send({ jsonrpc: '2.0', id, result: { resources } });
  } else if (method === 'resources/read') {
    if (params?.uri === 'memo://hello') {
      send({
        jsonrpc: '2.0',
        id,
        result: { contents: [{ uri: 'memo://hello', mimeType: 'text/plain', type: 'text', text: 'hello from resource' }] },
      });
    } else {
      send({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Unknown resource' } });
    }
  } else if (method === 'prompts/list') {
    send({ jsonrpc: '2.0', id, result: { prompts } });
  } else if (method === 'prompts/get') {
    if (params?.name === 'greet') {
      const who = params.arguments?.name ?? 'world';
      send({
        jsonrpc: '2.0',
        id,
        result: {
          description: 'Greeting prompt',
          messages: [{ role: 'user', content: { type: 'text', text: `Say hello to ${who}` } }],
        },
      });
    } else {
      send({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Unknown prompt' } });
    }
  } else if (id != null) {
    send({ jsonrpc: '2.0', id, error: { code: -32601, message: 'Method not found' } });
  }
});
