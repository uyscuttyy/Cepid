/**
 * Demo trading agent — orchestrator (the agent's main loop).
 *
 * This is the DEMO CONSUMER of CEPID, not the product. The loop:
 *   1. Load config + open session
 *   2. Discover market, build trading conditions
 *   3. Ask CEPID for relevant memories (generic Situation via toSituation)
 *   4. Decide (base strategy + memory influence; scars can veto)
 *   5. Risk-check
 *   6. Execute (or preview) via the market provider
 *   7. Observe the outcome and translate it with toOutcome() —
 *      marketOutcome / tradeOutcome / PnL computed INDEPENDENTLY
 *   8. Record retrieval + decision + outcome with CEPID; re-link patterns/scars
 *
 * Security: the private key NEVER enters events, memory, or any persisted
 * record. Events carry no wallet field at all (the old `wallet: privateKey`
 * bug is dead). Memory influence never bypasses risk.
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
import {
  SibylRepository,
  linkPatterns,
  updateScars,
  runDecay,
  evaluateAndStore,
  markMemoryUsed,
  type RetrievedMemory,
} from '@cepid/server';
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
  /** The CEPID memory id this run produced, when one was stored. */
  memoryId: string | null;
  retrieved: RetrievedMemory[];
  state: ExecutionState;
}

export async function runOnce(opts: OrchestratorOptions): Promise<RunResult> {
  const config = loadConfig();
  const agentId = config.agentId;
  const sidecarUrl = process.env.CEPID_SIDECAR_URL ?? 'http://127.0.0.1:8765';
  const sidecarToken = process.env.SIDECAR_TOKEN ?? 'dev-sidecar-token';
  const memory = new SibylRepository(sidecarUrl, sidecarToken);
  const sessions = new SessionRepository(config.dataDir);
  const events = new EventStore();
  const provider = createMarketProvider(config, opts.mockSeed);

  const session = await openSession(sessions, config);

  await runDecay(memory, agentId);

  const markets = await provider.listActiveMarkets({ assets: ['BTC', 'ETH'], timeframes: ['15M', '1H'] });
  if (markets.length === 0) {
    throw new Error('No active BTC/ETH 15m/1h markets found');
  }
  const market = markets[0]!;
  const book = await provider.getOrderBook(market.id);
  const conditions = deriveContext(market, book);

  const engine = new MemoryInformedDecisionEngine({
    strategy: new DeterministicStrategy(),
    memory,
    agentId,
  });

  // The base intent determines what we're "considering" for the situation.
  const baseStrategy = new DeterministicStrategy();
  const baseIntent = baseStrategy.decide(market, book);
  const considering = baseIntent.direction;

  const { intent, decision, retrieved } = await engine.decide(market, book, conditions, considering);

  const risk = evaluateRisk(intent, market, session, config);

  let state: ExecutionState = 'IDLE';
  let execution: ExecutionContext = { executedAt: new Date().toISOString() };
  let resolution: ResolutionResult | null = null;
  let memoryId: string | null = null;

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

    // Translate the outcome INDEPENDENTLY (the old inversion bug dies here).
    const outcome = toOutcome({
      direction: intent.direction,
      resolution: resolution
        ? resolution
        : { outcome: 'PENDING', finalYesPrice: 0, marketId: market.id, settledAt: '' },
      entryPrice: execution.entryPrice ?? intent.price,
      shares: execution.shares ?? intent.shares,
      txHash: execution.txHash,
      expectation: `Base ${(decision.baseConfidence * 100).toFixed(0)}% → final ${(decision.finalConfidence * 100).toFixed(0)}% after memory`,
      lesson: buildLesson(intent, conditions, decision, retrieved),
    });

    // Mark the memories that actually fed this decision — real counts only.
    if (decision.memoryIds.length > 0) {
      await markMemoryUsed(memory, agentId, decision.memoryIds);
    }

    // Store the experience (even NO_TRADE previews learn; PENDING stays null-outcome).
    const situation = toSituation(conditions, considering);
    const stored = await evaluateAndStore(memory, {
      agentId,
      situation,
      decision: {
        action: intent.direction,
        confidenceBase: decision.baseConfidence,
        confidenceFinal: decision.finalConfidence,
        memoryInfluence: decision.memoryInfluence,
        memoryIds: decision.memoryIds,
        reasoning: decision.reasoning,
      },
      outcome: outcome ?? {
        result: 'PENDING',
        valence: 'neutral',
        metrics: {},
        marketOutcome: 'UNRESOLVED',
        tradeOutcome: 'PENDING',
        observedAt: new Date().toISOString(),
      },
      source: `run:${session.id}`,
      decisionId: null,
    });
    memoryId = stored.id;
    session.memoryIds.push(stored.id);

    await linkPatterns(memory, agentId);
    await updateScars(memory, agentId);
  }

  await sessions.upsert(session);

  // Event log: agent-run facts ONLY. No wallet, no key, no secrets — ever.
  await events.append({
    type: 'run',
    at: new Date().toISOString(),
    state,
    network: config.network,
    session: { id: session.id },
    agentId,
    market: {
      id: market.id,
      title: market.title,
      asset: market.asset,
      timeframe: market.timeframe,
      yesPrice: market.yesPrice,
      expiresAt: market.expiresAt,
    },
    conditions,
    intent,
    risk,
    decision,
    retrieved: retrieved.map((r) => ({
      memoryId: r.memory.id,
      similarity: r.similarity,
      retrievalScore: r.retrievalScore,
      isScar: r.isScar,
      isPattern: r.isPattern,
      action: r.memory.action,
      valence: r.memory.outcome?.valence ?? null,
    })),
    memoryId,
    resolution: resolution
      ? { outcome: resolution.outcome, finalYesPrice: resolution.finalYesPrice }
      : null,
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
      hash: execution.txHash,   // tx hash only — it is public chain data
      state,
    });
  }

  return {
    session,
    market,
    book,
    conditions,
    intent,
    risk,
    decisionContext: decision,
    execution,
    memoryId,
    retrieved,
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
  retrieved: RetrievedMemory[],
): string {
  if (intent.direction === 'NO_TRADE') {
    if (retrieved.length === 0) return 'No trade; base strategy found no edge.';
    const bad = retrieved.filter((r) => r.memory.outcome?.valence === 'bad').length;
    return `No trade; ${bad} of ${retrieved.length} similar past setups had bad outcomes.`;
  }
  const bias = decision.memoryInfluence < 0
    ? 'memory was bearish on this move'
    : decision.memoryInfluence > 0
      ? 'memory was supportive'
      : 'memory was neutral';
  return `Trade ${intent.direction} on ${conditions.asset} ${conditions.timeframe} (${conditions.volatility} vol, ${conditions.momentum} momentum, ${conditions.timeRemainingBucket} left) — ${bias}.`;
}
