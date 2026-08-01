/**
 * McpClient — connects to an MCP server via stdio transport.
 * Handles the JSON-RPC handshake and request/response lifecycle.
 */

import { spawn, type ChildProcess } from 'node:child_process';
import { createInterface } from 'node:readline';

// ── Types ────────────────────────────────────────────────────────────────────

export interface McpServerConfig {
  command: string;
  args?: string[];
  /** Connection / per-request timeout in ms. Default: 10000 */
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
  private stderr = '';
  private closed = false;

  constructor(config: McpServerConfig) {
    this.config = config;
  }

  /** Spawn the server process and run the initialize handshake */
  async connect(): Promise<void> {
    if (this.connected) return;
    this.closed = false;
    this.stderr = '';

    const { command, args = [], timeout = 10000, cwd, env } = this.config;
    const timeoutMs = timeout;

    this.proc = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
      env: env ? { ...process.env, ...env } : process.env,
    });

    // Surface spawn failures (ENOENT, EACCES, etc.)
    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        cleanup();
        reject(new Error(`Failed to spawn MCP server "${command}": ${err.message}`));
      };
      const onSpawn = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        this.proc?.off('error', onError);
        this.proc?.off('spawn', onSpawn);
      };

      this.proc!.once('error', onError);
      this.proc!.once('spawn', onSpawn);

      // Already spawned (common when pid is assigned synchronously)
      if (this.proc!.pid != null) {
        cleanup();
        resolve();
      }
    });

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
        // Notifications / unmatched responses are ignored (valid in MCP)
      } catch {
        // Non-JSON stdout noise — ignore
      }
    });

    this.proc.stderr?.on('data', (chunk: Buffer) => {
      this.stderr += chunk.toString();
      // Cap stderr buffer to avoid unbounded growth
      if (this.stderr.length > 64_000) {
        this.stderr = this.stderr.slice(-32_000);
      }
    });

    // Handle unexpected exit
    this.proc.on('exit', (code, signal) => {
      const wasConnected = this.connected;
      this.connected = false;
      if (this.closed) return;
      const reason = signal
        ? `Server killed by signal ${signal}: ${this.stderr.slice(0, 200)}`
        : `Server exited (code ${code}): ${this.stderr.slice(0, 200)}`;
      this.rejectAllPending(new Error(reason));
      // If exit happened before handshake finished, leave pending empty for connect to fail
      if (!wasConnected && this.pending.size === 0) {
        // no-op — connect()'s request will have been rejected
      }
    });

    // Guard against stdin pipe breakage
    this.proc.stdin?.on('error', (err: Error) => {
      if (this.closed) return;
      this.rejectAllPending(new Error(`Server stdin error: ${err.message}`));
    });

    try {
      // Send initialize
      await this.request('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'cobasaja', version: '1.1.0' },
      }, timeoutMs);

      // Send initialized notification (fire-and-forget)
      this.sendNotification('notifications/initialized');

      this.connected = true;

      // Pre-fetch tools list
      const toolsResult = await this.request('tools/list', {}, timeoutMs) as { tools: McpToolDefinition[] };
      this._tools = toolsResult.tools ?? [];
    } catch (err) {
      await this.close().catch(() => {});
      throw err;
    }
  }

  /** List available tools */
  get tools(): McpToolDefinition[] {
    if (!this._tools) throw new Error('Not connected — call connect() first');
    return this._tools;
  }

  /** Last captured stderr from the server process */
  get lastStderr(): string {
    return this.stderr;
  }

  /** Call an MCP tool and return the result */
  async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpToolResult> {
    if (!this.connected || !this.proc) {
      throw new Error('Not connected — call connect() first');
    }
    const result = await this.request('tools/call', { name, arguments: args }, this.config.timeout ?? 10000);
    return result as McpToolResult;
  }

  /** Close the connection and kill the server process */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.connected = false;
    this.rejectAllPending(new Error('Connection closed'));

    this.rl?.close();
    this.rl = null;

    const proc = this.proc;
    this.proc = null;
    this._tools = null;

    if (!proc || proc.killed) return;

    // Try graceful SIGTERM, then SIGKILL
    await new Promise<void>((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        clearTimeout(killTimer);
        resolve();
      };

      proc.once('exit', done);

      try {
        proc.kill('SIGTERM');
      } catch {
        done();
        return;
      }

      const killTimer = setTimeout(() => {
        try {
          if (!proc.killed) proc.kill('SIGKILL');
        } catch { /* already dead */ }
        // Give SIGKILL a brief moment, then resolve either way
        setTimeout(done, 100);
      }, 500);
    });
  }

  private rejectAllPending(err: Error): void {
    this.pending.forEach((pr) => {
      clearTimeout(pr.timer);
      pr.reject(err);
    });
    this.pending.clear();
  }

  private sendNotification(method: string, params?: Record<string, unknown>): void {
    if (!this.proc?.stdin || this.proc.stdin.destroyed) {
      throw new Error(`Cannot send notification "${method}": server stdin is closed`);
    }
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    this.proc.stdin.write(msg);
  }

  private request(method: string, params: Record<string, unknown>, timeoutMs = 10000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.proc?.stdin || this.proc.stdin.destroyed || this.closed) {
        reject(new Error(`Cannot send request "${method}": server is not connected`));
        return;
      }

      const id = this.nextId++;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timed out after ${timeoutMs}ms: ${method}`));
      }, timeoutMs);

      this.pending.set(id, { resolve, reject, timer });

      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
      const ok = this.proc.stdin.write(msg);
      if (!ok) {
        // Backpressure — wait for drain, but don't fail the request
        this.proc.stdin.once('drain', () => {});
      }
    });
  }
}
