/**
 * Demo agent test fixture: boots the real Sibyl sidecar (from the sibling
 * `sidecar/` workspace) on a scratch DB and yields a SibylRepository pointed
 * at it. The agent's tests run against the true substrate — no JSON fallback
 * exists to test against.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SibylRepository } from '@cepid/server';

const here = fileURLToPath(new URL('.', import.meta.url));
// From agents/demo-trader/test/helpers/, the repo root (and sidecar/) is 4 levels up.
const SIDECAR_DIR = join(here, '../../../..', 'sidecar');

export interface SidecarHandle {
  repo: SibylRepository;
  baseUrl: string;
  kill(): void;
  dispose(): void;
}

export async function withSidecar(fn: (h: SidecarHandle) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'cepid-agent-sidecar-'));
  const dbPath = join(dir, 'memory.db');
  const port = 33000 + Math.floor(Math.random() * 20000);
  const baseUrl = `http://127.0.0.1:${port}`;
  const token = `agent-test-${port}`;

  const proc: ChildProcess = spawn(
    'uvicorn',
    ['sibyl_sidecar.main:app', '--port', String(port), '--host', '127.0.0.1', '--log-level', 'warning'],
    {
      cwd: SIDECAR_DIR,
      env: {
        ...process.env,
        CEPID_MEMORY_DB: dbPath,
        SIDECAR_TOKEN: token,
        PATH: `${join(SIDECAR_DIR, '.venv/bin')}:${process.env.PATH ?? ''}`,
      },
      stdio: 'ignore',
    },
  );

  const deadline = Date.now() + 30_000;
  let up = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/health`, { headers: { 'x-sidecar-token': token } });
      if (res.ok) { up = true; break; }
    } catch { /* booting */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!up) {
    proc.kill('SIGKILL');
    throw new Error(`agent-test sidecar failed to start on ${baseUrl}`);
  }

  try {
    await fn({
      repo: new SibylRepository(baseUrl, token),
      baseUrl,
      kill: () => proc.kill('SIGKILL'),
      dispose: () => { proc.kill('SIGKILL'); },
    });
  } finally {
    proc.kill('SIGKILL');
    await new Promise((r) => setTimeout(r, 150));
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}

/** Configure env so runOnce() talks to THIS sidecar instance. */
export function envFor(h: { baseUrl: string; token?: string }, token: string): void {
  process.env.CEPID_SIDECAR_URL = h.baseUrl;
  process.env.SIDECAR_TOKEN = token;
}
