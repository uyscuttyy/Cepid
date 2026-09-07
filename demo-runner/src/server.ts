/**
 * Demo-runner HTTP service (maintainer-side, localhost only).
 *
 *   POST /jobs        start the two-run proof (single-flight; 409 while busy)
 *   GET  /jobs/:id    poll status, phases, log, and result
 *   GET  /healthz     liveness
 *
 * The UI proxies here via /api/demo/* — strangers never touch this port.
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ViemChainAdapter } from './chain.js';
import { runDemoJob, type DemoResult, type RunnerDeps } from './runner.js';

const PORT = Number(process.env.DEMO_RUNNER_PORT ?? 8798);

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is required to run the demo service`);
  return v;
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const jobs = new Map<string, DemoResult>();
let activeJobId: string | null = null;

function deps(): RunnerDeps {
  const artifactPath = process.env.DEMO_MARKET_ARTIFACT
    ?? join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'contracts', 'out', 'CepidTestMarket.sol', 'CepidTestMarket.json');
  const artifact = JSON.parse(readFileSync(artifactPath, 'utf8')) as { abi: unknown[]; bytecode: string | { object: string } };
  return {
    cepidBaseUrl: required('CEPID_API_URL'),
    chain: new ViemChainAdapter({
      rpcUrl: required('CEPID_RPC_URL_BASE_SEPOLIA'),
      privateKey: required('DEMO_AGENT_PRIVATE_KEY') as `0x${string}`,
      marketArtifact: artifact,
    }),
    rpcUrl: required('CEPID_RPC_URL_BASE_SEPOLIA'),
    keyStorePath: process.env.DEMO_KEYSTORE ?? join(process.cwd(), 'data', 'demo-agent.json'),
    dataDir: process.env.DEMO_DATA_DIR ?? join(process.cwd(), 'data', 'sessions'),
    network: 'base-sepolia',
    sleepMs: (ms) => new Promise((r) => setTimeout(r, ms)),
  };
}

const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  void (async () => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/healthz') {
      return json(res, 200, { ok: true, service: 'cepid-demo-runner', activeJobId });
    }
    if (req.method === 'POST' && url.pathname === '/jobs') {
      if (activeJobId) {
        const active = jobs.get(activeJobId);
        if (active && active.status === 'running') {
          return json(res, 409, { error: 'DEMO_RUNNING', jobId: activeJobId });
        }
      }
      const jobId = `demo-${randomUUID().slice(0, 8)}`;
      const result: DemoResult = {
        jobId, status: 'running', phase: 'agent', log: [], agentId: null,
        market1: null, market2: null, legs: [], settleTx: null, run2: null,
        error: null, startedAt: new Date().toISOString(), finishedAt: null,
      };
      jobs.set(jobId, result);
      activeJobId = jobId;
      void runDemoJob(jobId, {
        ...deps(),
        onLog: (entry) => {
          result.log.push(entry);
          result.phase = entry.phase;
        },
      }).then((final) => {
        jobs.set(jobId, final);
        if (activeJobId === jobId) activeJobId = null;
      }).catch((e: unknown) => {
        result.status = 'failed';
        result.phase = 'failed';
        result.error = e instanceof Error ? e.message : String(e);
        result.finishedAt = new Date().toISOString();
        if (activeJobId === jobId) activeJobId = null;
      });
      return json(res, 202, { jobId, status: 'running' });
    }
    const m = /^\/jobs\/([A-Za-z0-9-]+)$/.exec(url.pathname);
    if (req.method === 'GET' && m) {
      const job = jobs.get(m[1]!);
      if (!job) return json(res, 404, { error: 'NOT_FOUND' });
      return json(res, 200, job);
    }
    return json(res, 404, { error: 'NOT_FOUND' });
  })().catch((e: unknown) => {
    json(res, 500, { error: 'INTERNAL', message: e instanceof Error ? e.message : String(e) });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[demo-runner] listening on 127.0.0.1:${PORT}`);
});
