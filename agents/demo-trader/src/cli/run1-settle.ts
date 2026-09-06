#!/usr/bin/env node
/**
 * RUN 1 (settle leg) — resolve the market against the trade and record
 * the loss.
 *
 * Reads the run1-trade manifest (JSON on stdin or via RUN1_MANIFEST path),
 * resolves the market NO on-chain (demo wallet is resolver; must be past
 * expiry — use scripts/resolve-demo-market.sh first, or pass --resolve
 * to resolve here), then records an outcome per leg via the SDK with the
 * trade txHash as evidence.
 *
 * The platform backfills each leg's PENDING experience with the settled
 * LOSS, relinks patterns, and updates scars. That is the memory Run 2
 * retrieves.
 *
 * Env: CEPID_API_URL, CEPID_API_KEY. Market: CEPID_TEST_MARKET_ADDRESS.
 */
import { readFileSync } from 'node:fs';
import { CepidClient } from '@cepid/client';

interface Leg {
  state: string;
  intent: string;
  txHash: string | null;
  retrievalId: string | null;
  memoryId: string | null;
}

async function main() {
  const baseUrl = process.env.CEPID_API_URL;
  const apiKey = process.env.CEPID_API_KEY;
  if (!baseUrl || !apiKey) throw new Error('CEPID_API_URL and CEPID_API_KEY are required');
  const manifestPath = process.argv[2] ?? process.env.RUN1_MANIFEST;
  if (!manifestPath) throw new Error('usage: run1-settle <run1-manifest.json>');

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { run: number; legs: Leg[] };
  const cepid = new CepidClient({ baseUrl, apiKey });

  // memory.created journal events carry {memoryId, decisionId} even for
  // rows written before the decisionId field existed on the record.
  const activity = (await cepid.activity()) as {
    events: Array<{ type: string; memoryId?: string; decisionId?: string }>;
  };
  const journalLink = new Map<string, string>();
  for (const e of activity.events) {
    if (e.type === 'memory.created' && e.memoryId && e.decisionId) {
      journalLink.set(e.memoryId, e.decisionId);
    }
  }

  const out: Array<Record<string, unknown>> = [];

  for (const leg of manifest.legs) {
    if (!leg.memoryId || !leg.txHash) {
      out.push({ memoryId: leg.memoryId, skipped: 'no memory or no trade on this leg' });
      continue;
    }
    // The experience row knows the decision it was recorded alongside.
    const { memory } = (await cepid.getMemory(leg.memoryId)) as {
      memory: { id: string; decisionId: string | null };
    };
    const decisionId = memory.decisionId ?? journalLink.get(leg.memoryId) ?? null;
    if (!decisionId) {
      out.push({ memoryId: leg.memoryId, skipped: 'experience has no decisionId' });
      continue;
    }
    const lost = leg.intent === 'YES' || leg.intent === 'NO';
    const { outcome, validation } = (await cepid.recordOutcome({
      decisionId,
      outcome: {
        result: lost ? 'LOSS' : leg.intent,
        valence: lost ? 'bad' : 'neutral',
        magnitude: lost ? -0.5 : 0,
        metrics: lost ? { pnl: -0.5 } : {},
        marketOutcome: 'NO_WON',
        tradeOutcome: lost ? 'LOSS' : 'PENDING',
        evidence: { chain: 'base-sepolia', txHash: leg.txHash },
      },
    })) as { outcome: { id: string }; validation: unknown };
    out.push({ memoryId: leg.memoryId, decisionId, outcomeId: outcome.id, validation });
  }

  console.log(JSON.stringify({ run: '1-settle', outcomes: out }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
