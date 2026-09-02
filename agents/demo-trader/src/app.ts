/**
 * Demo trading agent — orchestrator (the agent's main loop).
 *
 * This is the DEMO CONSUMER of CEPID, not the product. Since Phase 4 the
 * agent consumes CEPID through the SAME HTTP API + SDK an external agent
 * uses — no in-process engine imports, no direct substrate access. If an
 * external agent can't do it, neither can the demo.
 *
 * The loop:
 *   1. Load config (CEPID_API_URL + CEPID_API_KEY) + open session
 *   2. Discover market, build trading conditions
 *   3. cepid.retrieve() — relevant memories over HTTP (paid route in Ph.7)
 *   4. Decide (base strategy + memory influence computed agent-side; the
 *      agent reasons over the memories CEPID returned)
 *   5. Risk-check (memory influence NEVER bypasses this)
 *   6. Execute (or preview) via the market provider
 *   7. Observe the outcome; toOutcome() computes marketOutcome /
 *      tradeOutcome / PnL INDEPENDENTLY
 *   8. cepid.recordDecision() with the retrieval edge, then
 *      cepid.recordOutcome() — the influence chain lives in CEPID's store
 *   9. cepid.recordExperience() for the run's memory
 *
 * Security: the private key never leaves this process (market signing only),
 * never enters events, memory, or API payloads.
 */
import { randomUUID } from 'node:crypto';
import type {
  AgentConfig,
  AgentSession,
  DecisionContext,
  ExecutionContext,
  ExecutionState,
  MarketSnapshot,
  OrderBook,
  Outcome,
  ResolutionResult,
  RiskDecision,
  TradeIntent,
  TradingConditions,
} from './config/types.js';
import { loadConfig } from './config/load.js';
import { toSituation, toOutcome } from './config/types.js';
import { createMarketProvider, type MarketProvider } from './market/index.js';
import { CepidClient, type RetrievedMemoryView, type Situation } from '@cepid/client';
import { MemoryInformedDecisionEngine } from './decision/engine.js';
import { DeterministicStrategy } from './strategy/base-strategy.js';
import { deriveContext } from './strategy/context.js';
import { evaluateRisk } from './risk/engine.js';
import { SessionRepository } from './sessions/repository.js';
import { EventStore } from './persistence/events.js';

export interface OrchestratorOptions {
  execute: boolean;
  confirmApproval: boolean;
  confirmOrder: boolean;
  mockSeed?: Parameters<typeof createMarketProvider>[1];
  /** Override the resolution the mock market resolves to (demo control). */
  mockResolution?: Outcome;
}

export interface RunResult {
  session: AgentSession;
  market: MarketSnapshot;
  book: OrderBook | null;
  conditions: TradingConditions;
  intent: TradeIntent;
  risk: RiskDecision;
  decisionContext: DecisionContext;
  execution: ExecutionContext;
  memoryId: string | null;
  retrievalId: string | null;
  retrieved: RetrievedMemoryView[];
  state: ExecutionState;
}

export async function runOnce(opts: OrchestratorOptions): Promise<RunResult> {
  const config = loadConfig();

  // CEPID access — the same SDK surface any external agent gets.
  if (!process.env.CEPID_API_URL || !process.env.CEPID_API_KEY) {
    throw new Error('CEPID_API_URL and CEPID_API_KEY are required — the agent consumes CEPID over HTTP only');
  }
  const cepid = new CepidClient({
    baseUrl: process.env.CEPID_API_URL,
    apiKey: process.env.CEPID_API_KEY,
  });

  const sessions = new SessionRepository(config.dataDir);
  const events = new EventStore();
  const provider = createMarketProvider(config, opts.mockSeed);

  const session = await openSession(sessions, config);

  const markets = await provider.listActiveMarkets({ assets: ['BTC', 'ETH'], timeframes: ['15M', '1H'] });
  if (markets.length === 0) {
    throw new Error('No active BTC/ETH 15m/1h markets found');
  }
  const market = markets[0]!;
  const book = await provider.getOrderBook(market.id);
  const conditions = deriveContext(market, book);

  // What the agent is considering shapes the situation it asks about.
  const baseStrategy = new DeterministicStrategy();
  const baseIntent = baseStrategy.decide(market, book);
  const considering = baseIntent.direction;

  // 3) Ask CEPID for relevant memories — over HTTP, like everyone else.
  const situation: Situation = toSituation(conditions, considering);
  const retrieval = await cepid.retrieve({ situation });

  // 4) Reason over the returned memories — agent-side decision logic.
  const engine = new MemoryInformedDecisionEngine({
    strategy: baseStrategy,
    retrieved: retrieval.memories,
  });
  const { intent, decision } = engine.decide(market, book, conditions, considering);

  // 5) Risk gate — never bypassed by memory.
  const risk = evaluateRisk(intent, market, session, config);

  let state: ExecutionState = 'IDLE';
  let execution: ExecutionContext = { executedAt: new Date().toISOString() };
  let resolution: ResolutionResult | null = null;
  let memoryId: string | null = null;

  // 6) Execute or preview — ONLY the market action is risk-gated. The
  // decision and its influence chain are recorded for EVERY decided path,
  // including memory vetoes: the veto IS the product's story.
  let recordedDecisionId: string | null = null;
  if (!risk.approved) {
    state = 'REJECTED';
    session.decisions++;
  } else {
    session.decisions++;
    if (!opts.execute) {
      state = 'DECISION_MADE';
    } else {
      state = 'SIGNING';
      const placeResult = await provider.placeOrder(intent);
      if (!placeResult.ok) {
        state = 'FAILED';
        execution = { ...execution, txHash: placeResult.txHash };
        session.trades++;
      } else {
        execution = {
          executedAt: new Date().toISOString(),
          entryPrice: placeResult.filledPrice ?? intent.price,
          shares: placeResult.filledShares ?? intent.shares,
          txHash: placeResult.txHash,
        };
        state = 'SUBMITTED';
        session.trades++;
        session.collateralSpent += execution.shares! * execution.entryPrice!;

        resolution = await provider.getResolution(market.id);
        if (resolution && resolution.outcome !== 'PENDING') {
          state = 'CONFIRMED';
        } else {
          state = 'POSITION_OPEN';
        }
      }
    }
  }

  // 8a) Record the decision with its influence edge — on every path. Only
  // memories the retrieval actually returned may be cited (API-enforced).
  const { decision: recorded } = await cepid.recordDecision({
    retrievalId: retrieval.retrievalId,
    memoryIds: decision.memoryIds.filter((id) =>
      retrieval.memories.some((m) => m.id === id)),
    situation,
    action: intent.direction,
    confidenceBase: decision.baseConfidence,
    confidenceFinal: decision.finalConfidence,
    memoryInfluence: decision.memoryInfluence,
    reasoning: decision.reasoning,
  });
  recordedDecisionId = recorded.id;

  // 8b) If the trade settled, record the outcome with on-chain evidence.
  if (resolution && resolution.outcome !== 'PENDING') {
    const outcome = toOutcome({
      direction: intent.direction,
      resolution,
      entryPrice: execution.entryPrice ?? intent.price,
      shares: execution.shares ?? intent.shares,
      txHash: execution.txHash,
      expectation: `Base ${(decision.baseConfidence * 100).toFixed(0)}% → final ${(decision.finalConfidence * 100).toFixed(0)}% after memory`,
      lesson: buildLesson(intent, conditions, decision, retrieval.memories),
    });
    if (outcome) {
      await cepid.recordOutcome({ decisionId: recorded.id, outcome });
    }
  }

  // 9) The experience itself becomes memory — on every decided path. A
  // vetoed run is exactly the experience the next session should find.
  const outcomeNow = resolution && resolution.outcome !== 'PENDING'
    ? toOutcome({
        direction: intent.direction,
        resolution,
        entryPrice: execution.entryPrice ?? intent.price,
        shares: execution.shares ?? intent.shares,
        txHash: execution.txHash,
        expectation: '',
        lesson: buildLesson(intent, conditions, decision, retrieval.memories),
      })
    : null;
  const { memory } = await cepid.recordExperience({
    situation,
    decision: {
      action: intent.direction,
      confidenceBase: decision.baseConfidence,
      confidenceFinal: decision.finalConfidence,
      memoryInfluence: decision.memoryInfluence,
      memoryIds: decision.memoryIds,
      reasoning: decision.reasoning,
    },
    outcome: outcomeNow ?? {
      result: 'PENDING', valence: 'neutral',
      metrics: {},
      marketOutcome: 'UNRESOLVED', tradeOutcome: 'PENDING',
    },
    source: `run:${session.id}`,
    decisionId: recorded.id,
  }) as { memory: { id: string } };
  memoryId = memory.id;
  session.memoryIds.push(memory.id);

  await sessions.upsert(session);

  // Agent-local run events: facts about the run only — no wallet, no keys.
  await events.append({
    type: 'run',
    at: new Date().toISOString(),
    state,
    network: config.network,
    session: { id: session.id },
    market: {
      id: market.id, title: market.title, asset: market.asset,
      timeframe: market.timeframe, yesPrice: market.yesPrice, expiresAt: market.expiresAt,
    },
    conditions,
    intent,
    risk,
    decision,
    retrieved: retrieval.memories.map((m) => ({
      memoryId: m.id, similarity: m.similarity, retrievalScore: m.retrievalScore,
      isScar: m.isScar, isPattern: m.isPattern, action: m.action,
      valence: m.outcome?.valence ?? null,
    })),
    retrievalId: retrieval.retrievalId,
    memoryId,
    resolution: resolution ? { outcome: resolution.outcome, finalYesPrice: resolution.finalYesPrice } : null,
  });

  if (execution.txHash) {
    await events.append({
      type: 'order_submitted',
      at: new Date().toISOString(),
      marketId: market.id,
      direction: intent.direction,
      quantity: intent.shares,
      price: intent.price,
      collateral: intent.shares * intent.price,
      hash: execution.txHash,   // public chain data only
      state,
    });
  }

  return {
    session, market, book, conditions, intent, risk,
    decisionContext: decision, execution, memoryId,
    retrievalId: retrieval.retrievalId,
    retrieved: retrieval.memories,
    state,
  };
}

async function openSession(sessions: SessionRepository, config: AgentConfig): Promise<AgentSession> {
  const id = `sess-${randomUUID().slice(0, 8)}`;
  const session: AgentSession = {
    id,
    startedAt: new Date().toISOString(),
    marketsObserved: [],
    decisions: 0,
    trades: 0,
    memoryIds: [],
    collateralSpent: 0,
    network: config.network,
  };
  await sessions.upsert(session);
  return session;
}

function buildLesson(
  intent: TradeIntent,
  conditions: TradingConditions,
  decision: DecisionContext,
  retrieved: RetrievedMemoryView[],
): string {
  if (intent.direction === 'NO_TRADE') {
    if (retrieved.length === 0) return 'No trade; base strategy found no edge.';
    const bad = retrieved.filter((m) => m.outcome?.valence === 'bad').length;
    return `No trade; ${bad} of ${retrieved.length} similar past setups had bad outcomes.`;
  }
  const bias = decision.memoryInfluence < 0
    ? 'memory was bearish on this move'
    : decision.memoryInfluence > 0
      ? 'memory was supportive'
      : 'memory was neutral';
  return `Trade ${intent.direction} on ${conditions.asset} ${conditions.timeframe} (${conditions.volatility} vol, ${conditions.momentum} momentum, ${conditions.timeRemainingBucket} left) — ${bias}.`;
}
