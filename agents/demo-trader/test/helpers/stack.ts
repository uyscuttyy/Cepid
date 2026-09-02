/**
 * Full-stack test fixture for the demo agent: boots the Sibyl sidecar AND
 * the CEPID API, registers an agent (real one-time key), and hands the
 * orchestrator the same env an external consumer would have.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SibylRepository, AgentRegistry, startApi } from '@cepid/server';

const here = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(here, '../../../..');          // repo root
const SIDECAR_DIR = join(ROOT, 'sidecar');
const CEPID_SRC = join(ROOT, 'cepid');

export interface Stack {
  baseUrl: string;
  apiKey: string;
  agentId: string;
  dbPath: string;
  sidecarPort: number;
  apiPort: number;
  repo: SibylRepository;
  restartSidecar(): Promise<void>;
  dispose(): Promise<void>;
}

async function bootSidecar(dbPath: string, port: number, token: string): Promise<ChildProcess> {
  const proc = spawn(
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
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, { headers: { 'x-sidecar-token': token } });
      if (res.ok) return proc;
    } catch { /* booting */ }
    await new Promise((r) => setTimeout(r, 250));
  }
  proc.kill('SIGKILL');
  throw new Error(`agent-stack sidecar failed to start on port ${port}`);
}

export async function withStack(fn: (stack: Stack) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'cepid-agent-stack-'));
  const dbPath = join(dir, 'memory.db');
  const sidecarPort = 44000 + Math.floor(Math.random() * 9000);
  const apiPort = 54000 + Math.floor(Math.random() * 9000);
  const token = `stack-${sidecarPort}`;

  let sidecarProc = await bootSidecar(dbPath, sidecarPort, token);
  const repo = new SibylRepository(`http://127.0.0.1:${sidecarPort}`, token);
  const registry = new AgentRegistry(repo);
  const api = await startApi({ repo, registry, port: apiPort });
  const baseUrl = `http://127.0.0.1:${apiPort}`;

  const reg = await fetch(`${baseUrl}/v1/agents/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Demo Trading Agent', description: 'CEPID reference consumer' }),
  });
  const { agent, apiKey } = (await reg.json()) as { agent: { id: string }; apiKey: string };

  // The orchestrator reads these env vars — exactly what a real consumer sets.
  process.env.CEPID_API_URL = baseUrl;
  process.env.CEPID_API_KEY = apiKey;
  process.env.DEMO_AGENT_ID = agent.id;

  try {
    await fn({
      baseUrl,
      apiKey,
      agentId: agent.id,
      dbPath,
      sidecarPort,
      apiPort,
      repo,
      async restartSidecar() {
        sidecarProc.kill('SIGKILL');
        await new Promise((r) => setTimeout(r, 300));
        sidecarProc = await bootSidecar(dbPath, sidecarPort, token);
      },
      async dispose() {
        api && await api.close();
        sidecarProc.kill('SIGKILL');
        await new Promise((r) => setTimeout(r, 150));
        try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
      },
    });
  } finally {
    try { await api.close(); } catch { /* already closed */ }
    sidecarProc.kill('SIGKILL');
    await new Promise((r) => setTimeout(r, 150));
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
  }
}
