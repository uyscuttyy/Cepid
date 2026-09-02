/**
 * Shared test fixture: boots the Sibyl sidecar on a scratch DB and hands out
 * SibylRepository instances. Memory engine tests that need persistence run
 * against the REAL substrate — same thing production uses.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SibylRepository } from '../../src/repository/sibyl-repository.js';

export interface SidecarFixture {
  baseUrl: string;
  token: string;
  /** Scratch DB file — restart a fixture on this path to test persistence. */
  dbPath: string;
  /** Kill the sidecar process (for load-bearing tests). */
  kill(): void;
  /** Wait until the sidecar stops responding. */
  waitDown(): Promise<void>;
  dispose(): Promise<void>;
}

export async function startSidecar(dbPath?: string): Promise<SidecarFixture> {
  const dir = mkdtempSync(join(tmpdir(), 'cepid-sidecar-'));
  const db = dbPath ?? join(dir, 'memory.db');
  const port = 8900 + Math.floor(Math.random() * 100);
  const baseUrl = `http://127.0.0.1:${port}`;
  const token = `test-token-${port}`;

  const proc: ChildProcess = spawn(
    'uvicorn',
    ['sibyl_sidecar.main:app', '--port', String(port), '--host', '127.0.0.1', '--log-level', 'warning'],
    {
      cwd: join(import.meta.dirname, '../../../sidecar'),
      env: {
        ...process.env,
        CEPID_MEMORY_DB: db,
        SIDECAR_TOKEN: token,
        PATH: `${join(import.meta.dirname, '../../../sidecar/.venv/bin')}:${process.env.PATH ?? ''}`,
      },
      stdio: 'ignore',
    },
  );

  // Wait for readiness with a bounded poll.
  const deadline = Date.now() + 30_000;
  let up = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`, { headers: { 'x-sidecar-token': token } });
      if (res.ok) { up = true; break; }
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!up) {
    proc.kill('SIGKILL');
    throw new Error(`sidecar failed to start on ${baseUrl} within 30s`);
  }

  return {
    baseUrl,
    token,
    dbPath: db,
    kill() {
      proc.kill('SIGKILL');
    },
    async waitDown() {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        try {
          await fetch(`${baseUrl}/health`, { headers: { 'x-sidecar-token': token } });
        } catch {
          return;
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error('sidecar did not go down');
    },
    async dispose() {
      proc.kill('SIGKILL');
      await new Promise((r) => setTimeout(r, 150));
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
    },
  };
}

export function repoFor(fx: SidecarFixture): SibylRepository {
  return new SibylRepository(fx.baseUrl, fx.token);
}
