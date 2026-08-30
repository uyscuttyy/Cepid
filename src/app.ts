/**
 * CEPID orchestrator — the agent's main loop, kept here so the CLI stays small.
 *
 * Phase flow:
 *  1. Load config + open session
 *  2. Discover market
 *  3. Build market context
 *  4. Retrieve memories
 *  5. Decide (base strategy + memory influence)
 *  6. Validate with risk
 *  7. Execute (or preview) via MarketProvider
 *  8. Record outcome
 *  9. Evaluate and store memory
 * 10. Re-link patterns / scars
 * 11. Close session
 *
 * The provider decides what "execute" means (chain call, mock fill, or dry-run).
 */
import { randomUUID } from 'node:crypto';
import type {
  AgentConfig,
  AgentSession,
  ExecutionContext,
  ExecutionState,
  Experience,
  MarketContext,
  MarketSnapshot,
  OrderBook,
  Outcome,
  ResolutionResult,
  RiskDecision,
  TradeIntent,
} from './config/types.js';
import { loadConfig } from './config/load.js';
import { createMarketProvider, type MarketProvider } from './market/index.js';
import { JsonMemoryRepository } from './memory/repository.js';
import { MemoryInformedDecisionEngine } from './decision/engine.js';
import { DeterministicStrategy } from './strategy/base-strategy.js';
import { deriveContext } from './strategy/context.js';
import { evaluateRisk } from './risk/engine.js';
import { evaluateAndStore } from './memory/evaluator.js';
import { linkPatterns } from './memory/linker.js';
import { updateScars } from './memory/scars.js';
import { runDecay } from './memory/decay.js';
import { SessionRepository } from './sessions/repository.js';
import { EventStore } from './persistence/events.js';

export interface OrchestratorOptions {
  execute: boolean;
  confirmApproval: boolean;
  confirmOrder: boolean;
  mockSeed?: Parameters<typeof createMarketProvider>[1];
}

export interface RunResult {
  session: AgentSession;
  market: MarketSnapshot;
  book: OrderBook | null;
  conditions: MarketContext;
  intent: TradeIntent;
  risk: RiskDecision;
  decisionContext: import('./config/types.js').DecisionContext;
  execution: ExecutionContext;
  experience: Experience | null;
  state: ExecutionState;
}

export async function runOnce(opts: OrchestratorOptions): Promise<RunResult> {
  const config = loadConfig();
  const memory = new JsonMemoryRepository(config.dataDir);
  const sessions = new SessionRepository(config.dataDir);
  const events = new EventStore();
  const provider = createMarketProvider(config, opts.mockSeed);

  const session = await openSession(sessions, config);

  await runDecay(memory);

  const markets = await provider.listActiveMarkets({ assets: ['BTC', 'ETH'], timeframes: ['15M', '1H'] });
  if (markets.length === 0) {
    throw new Error('No active BTC/ETH 15m/1h markets found');
  }
  const market = markets[0]!;
  const book = await provider.getOrderBook(market.id);
  const conditions = deriveContext(market, book);

  const engine = new MemoryInformedDecisionEngine({ strategy: new DeterministicStrategy(), memory });
  const { intent, decision, retrieved } = await engine.decide(market, book, conditions);

  const risk = evaluateRisk(intent, market, session, config);

  let state: ExecutionState = 'IDLE';
  let execution: ExecutionContext = { executedAt: new Date().toISOString() };
  let experience: Experience | null = null;
  let outcome: Outcome = 'PENDING';
  let pnl = 0;

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
        const resolution = await provider.getResolution(market.id);
        if (resolution && resolution.outcome !== 'PENDING') {
          outcome = resolution.outcome;
          pnl = computePnl(intent, execution, resolution);
          state = 'CONFIRMED';
        } else {
          state = 'POSITION_OPEN';
        }
        session.trades++;
      }
    }

    // Evaluate the experience regardless of whether we executed (preview learns too).
    const lesson = buildLesson(intent, conditions, decision, retrieved);
    const expectation = `Base strategy expected ${(decision.baseConfidence * 100).toFixed(0)}% confidence; memory influence was ${(decision.memoryInfluence * 100).toFixed(1)}%`;
    experience = await evaluateAndStore(memory, {
      sessionId: session.id,
      market,
      conditions,
      decision: { ...decision, decision: intent.direction },
      intent,
      execution,
      outcome,
      pnl,
      expectation,
      lesson,
    });
    session.memoryIds.push(experience.id);

    await linkPatterns(memory);
    await updateScars(memory);
  }

  await sessions.upsert(session);

  // Persist the decision as a structured event the UI can read.
  await events.append({
    type: 'preview',
    at: new Date().toISOString(),
    wallet: config.privateKey,
    state,
    session: { id: session.id },
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
      experience: {
        id: r.experience.id,
        outcome: r.experience.outcome,
      },
      similarity: r.similarity,
      isScar: r.isScar,
      isPattern: r.isPattern,
      retrievalScore: r.retrievalScore,
    })),
    experienceId: experience?.id ?? null,
  });

  const orderSubmittedStates: ExecutionState[] = ['SUBMITTED', 'CONFIRMED', 'POSITION_OPEN'];
  if (orderSubmittedStates.includes(state) && execution.txHash) {
    await events.append({
      type: 'order_submitted',
      at: new Date().toISOString(),
      wallet: config.privateKey,
      marketId: market.id,
      marketSymbol: market.id,
      direction: intent.direction,
      quantity: intent.shares,
      price: intent.price,
      collateral: intent.shares * intent.price,
      hash: execution.txHash,
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
    experience,
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
    network: config.network,
  };
  await sessions.upsert(session);
  return session;
}

function computePnl(intent: TradeIntent, exec: ExecutionContext, res: ResolutionResult): number {
  if (intent.direction === 'NO_TRADE') return 0;
  const shares = exec.shares ?? intent.shares;
  const entry = exec.entryPrice ?? intent.price;
  const won = (intent.direction === 'YES' && res.outcome === 'WIN') || (intent.direction === 'NO' && res.outcome === 'LOSS');
  if (won) return shares * (1 - entry);
  return -shares * entry;
}

function buildLesson(
  intent: TradeIntent,
  conditions: MarketContext,
  decision: import('./config/types.js').DecisionContext,
  retrieved: import('./config/types.js').RetrievedMemory[],
): string {
  if (intent.direction === 'NO_TRADE') {
    if (retrieved.length === 0) return 'No trade; base strategy found no edge.';
    const losses = retrieved.filter((r) => r.experience.outcome.outcome === 'LOSS').length;
    return `No trade; ${losses} of ${retrieved.length} similar past setups resulted in losses.`;
  }
  const bias = decision.memoryInfluence < 0 ? 'memory was bearish' : decision.memoryInfluence > 0 ? 'memory was supportive' : 'memory was neutral';
  return `Trade ${intent.direction} on ${conditions.asset} ${conditions.timeframe} (${conditions.volatility} vol, ${conditions.momentum} momentum, ${conditions.timeRemainingBucket} remaining) — ${bias}.`;
}
