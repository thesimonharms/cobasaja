/**
 * McpClient — connects to an MCP server via stdio transport.
 * Handles the JSON-RPC handshake and request/response lifecycle.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';
import { randomUUID } from 'node:crypto';

// ── Types ────────────────────────────────────────────────────────────────────

export interface McpServerConfig {
  command: string;
  args?: string[];
  /** Connection timeout in ms. Default: 10000 */
  timeout?: number;
  /** Cwd for the server process */
  cwd?: string;
  /** Env vars to pass (merged with process.env) */
  env?: Record<string, string>;
}

export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface McpToolResult {
  content: { type: string; text?: string; data?: string; mimeType?: string }[];
  isError?: boolean;
  [key: string]: unknown;
}

interface PendingRequest {
  resolve: (data: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ── Client ───────────────────────────────────────────────────────────────────

export class McpClient {
  private proc: ChildProcess | null = null;
  private rl: ReturnType<typeof createInterface> | null = null;
  private pending = new Map<string | number, PendingRequest>();
  private nextId = 1;
  private _tools: McpToolDefinition[] | null = null;
  private config: McpServerConfig;
  private connected = false;

  constructor(config: McpServerConfig) {
    this.config = config;
  }

  /** Spawn the server process and run the initialize handshake */
  async connect(): Promise<void> {
    if (this.connected) return;

    const { command, args = [], timeout = 10000, cwd, env } = this.config;

    this.proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
    });

    const timeoutMs = timeout;

    // Channel: stdout → readline → JSON parse → resolve pending
    this.rl = createInterface({ input: this.proc.stdout! });
    this.rl.on('line', (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        const msg = JSON.parse(trimmed);
        const id = msg.id;
        if (id != null && this.pending.has(id)) {
          const pr = this.pending.get(id)!;
          clearTimeout(pr.timer);
          this.pending.delete(id);
          if (msg.error) {
            pr.reject(new Error(msg.error.message || 'RPC error'));
          } else {
            pr.resolve(msg.result);
          }
        }
      } catch {
        // Non-JSON output from stderr or startup noise — ignore
      }
    });

    // Stderr: just buffer for errors, surfaced on close
    let stderr = '';
    this.proc.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    // Handle unexpected exit
    this.proc.on('exit', (code) => {
      if (this.connected) {
        this.connected = false;
        // Reject all pending requests
        this.pending.forEach((pr) => {
          clearTimeout(pr.timer);
          pr.reject(new Error(`Server exited (code ${code}): ${stderr.slice(0, 200)}`));
        });
        this.pending.clear();
      }
    });

    // Wait a tiny bit for process to start, then initialize
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Process did not start')), timeoutMs);
      if (this.proc!.pid != null) {
        clearTimeout(timer);
        resolve();
      } else {
        this.proc!.once('spawn', () => {
          clearTimeout(timer);
          resolve();
        });
      }
    });

    // Send initialize
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'cobasaja', version: '0.1.0' },
    }, timeoutMs);

    // Send initialized notification (fire-and-forget)
    this.sendNotification('notifications/initialized');

    this.connected = true;

    // Pre-fetch tools list
    const toolsResult = await this.request('tools/list', {}, timeoutMs) as { tools: McpToolDefinition[] };
    this._tools = toolsResult.tools ?? [];
  }

  /** List available tools */
  get tools(): McpToolDefinition[] {
    if (!this._tools) throw new Error('Not connected — call connect() first');
    return this._tools;
  }

  /** Call an MCP tool and return the result */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpToolResult> {
    const result = await this.request('tools/call', { name, arguments: args });
    return result as McpToolResult;
  }

  /** Close the connection and kill the server process */
  async close(): Promise<void> {
    this.connected = false;
    // Reject any leftover pending
    this.pending.forEach((pr) => {
      clearTimeout(pr.timer);
      pr.reject(new Error('Connection closed'));
    });
    this.pending.clear();
    this.rl?.close();
    this.rl = null;
    if (this.proc && !this.proc.killed) {
      this.proc.kill();
      // Give it a moment, then SIGKILL
      await new Promise(r => setTimeout(r, 200));
      if (this.proc && !this.proc.killed) {
        this.proc.kill('SIGKILL');
      }
    }
    this.proc = null;
    this._tools = null;
  }

  private sendNotification(method: string, params?: Record<string, unknown>): void {
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    this.proc?.stdin?.write(msg);
  }

  private request(method: string, params: Record<string, unknown>, timeoutMs = 10000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timed out after ${timeoutMs}ms: ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      this.proc?.stdin?.write(msg);
    });
  }
}
