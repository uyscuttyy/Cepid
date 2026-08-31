/**
 * View models.
 *
 * Every value here is derived from what the agent actually recorded in
 * `${CEPID_DATA_DIR}` — experiences, patterns, scars, sessions, and the
 * append-only event log. Nothing is inferred, defaulted to a plausible number,
 * or invented to fill a layout. When a field is absent, the model says so with
 * `null` and the UI renders a truthful state.
 *
 * Server-only: this module is imported by pages and API routes, never by a
 * client component.
 *
 * SECURITY: `AgentEvent.wallet` in the event log contains the agent's signer
 * key material (the orchestrator writes `config.privateKey` there). Nothing in
 * this module reads or forwards that field, and no view model carries it. The
 * only address shown anywhere in the UI is the derived public address from
 * `getAgentSnapshot()`.
 */
import 'server-only';
import type {
  AgentEvent,
  Direction,
  Experience,
  Outcome,
} from './types.js';

/* -------------------------------------------------------------------------- */
/* Agent state                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The execution states the orchestrator records on each event, plus the two
 * states the UI can determine on its own: OFFLINE (no data written at all) and
 * IDLE (data exists but the most recent run finished a while ago).
 *
 * These names match `ExecutionState` in the agent's own types, so the UI never
 * shows a state the agent cannot be in.
 */
export type AgentStateName =
  | 'OFFLINE'
  | 'IDLE'
  | 'ANALYZING'
  | 'DECISION_MADE'
  | 'RISK_CHECK'
  | 'SIGNING'
  | 'SUBMITTED'
  | 'POSITION_OPEN'
  | 'CONFIRMED'
  | 'REJECTED'
  | 'FAILED';

export type AgentTone = 'live' | 'settled' | 'held' | 'fault' | 'idle';

export interface AgentState {
  name: AgentStateName;
  /** Short human label shown next to the indicator. */
  label: string;
  tone: AgentTone;
  /** One sentence explaining what this state means for this agent, right now. */
  detail: string;
  /** ISO timestamp of the event this state came from, or null when offline. */
  at: string | null;
  /** True when the most recent recorded activity is within the live window. */
  fresh: boolean;
}

/**
 * How recently the agent must have written an event for its state to be
 * treated as live rather than idle. The agent runs as a one-shot CLI session,
 * so "live" means "a session is plausibly still in flight".
 */
const LIVE_WINDOW_MS = 90_000;

const STATE_COPY: Record<
  Exclude<AgentStateName, 'OFFLINE' | 'IDLE'>,
  { label: string; tone: AgentTone; detail: string }
> = {
  ANALYZING: {
    label: 'Analyzing',
    tone: 'live',
    detail: 'Reading the market and retrieving similar experiences.',
  },
  DECISION_MADE: {
    label: 'Decision made',
    tone: 'live',
    detail: 'Base strategy and memory influence reconciled. No order was submitted.',
  },
  RISK_CHECK: {
    label: 'Risk check',
    tone: 'live',
    detail: 'The risk engine is evaluating the intended order.',
  },
  SIGNING: {
    label: 'Signing',
    tone: 'live',
    detail: 'Building and signing the order payload.',
  },
  SUBMITTED: {
    label: 'Submitted',
    tone: 'live',
    detail: 'Order broadcast. Waiting on settlement data.',
  },
  POSITION_OPEN: {
    label: 'Position open',
    tone: 'live',
    detail: 'The order filled and the market has not resolved yet.',
  },
  CONFIRMED: {
    label: 'Confirmed',
    tone: 'settled',
    detail: 'The market resolved and the outcome became a memory.',
  },
  REJECTED: {
    label: 'Rejected',
    tone: 'held',
    detail: 'Risk or memory vetoed the trade. Nothing was submitted.',
  },
  FAILED: {
    label: 'Failed',
    tone: 'fault',
    detail: 'The provider or chain rejected the order.',
  },
};

export function deriveAgentState(events: AgentEvent[], now = Date.now()): AgentState {
  const latest = latestEvent(events);
  if (!latest) {
    return {
      name: 'OFFLINE',
      label: 'Offline',
      tone: 'idle',
      detail: 'No agent session has been recorded yet.',
      at: null,
      fresh: false,
    };
  }

  const at = String(latest.at);
  const age = now - new Date(at).getTime();
  const fresh = Number.isFinite(age) && age >= 0 && age < LIVE_WINDOW_MS;
  const raw = typeof latest.state === 'string' ? latest.state : null;
  const copy = raw && raw in STATE_COPY
    ? STATE_COPY[raw as keyof typeof STATE_COPY]
    : null;

  if (!copy) {
    return {
      name: 'IDLE',
      label: 'Idle',
      tone: 'idle',
      detail: 'No session in flight. The last recorded activity is shown below.',
      at,
      fresh: false,
    };
  }

  // A live-tone state only reads as live while it is recent. An hour-old
  // "SUBMITTED" is not the agent working — it is the last thing it did.
  if (copy.tone === 'live' && !fresh) {
    // POSITION_OPEN is genuinely a standing state: the position stays open
    // until the market resolves, so it does not decay into idle.
    if (raw === 'POSITION_OPEN') {
      return { name: 'POSITION_OPEN', ...copy, at, fresh: false };
    }
    return {
      name: raw as AgentStateName,
      label: copy.label,
      tone: 'idle',
      detail: copy.detail,
      at,
      fresh: false,
    };
  }

  return { name: raw as AgentStateName, ...copy, at, fresh };
}

function latestEvent(events: AgentEvent[]): AgentEvent | null {
  let best: AgentEvent | null = null;
  for (const e of events) {
    if (!e || typeof e.at !== 'string') continue;
    if (!best || e.at > String(best.at)) best = e;
  }
  return best;
}

/* -------------------------------------------------------------------------- */
/* Decisions                                                                   */
/* -------------------------------------------------------------------------- */

export interface RetrievedMemoryView {
  experienceId: string;
  outcome: Outcome;
  pnl: number;
  lesson: string;
  similarity: number;
  retrievalScore: number;
  isScar: boolean;
  isPattern: boolean;
  /** Populated when the referenced experience is still in the memory store. */
  asset: string | null;
  timeframe: string | null;
  direction: Direction | null;
  createdAt: string | null;
}

export interface ConditionsView {
  asset: string;
  timeframe: string;
  yesPrice: number | null;
  midpointDistance: number | null;
  volatility: string | null;
  momentum: string | null;
  liquidity: string | null
  timeRemainingBucket: string | null;
}

export interface DecisionView {
  at: string;
  state: string | null;
  market: {
    id: string | null;
    title: string | null;
    asset: string | null;
    timeframe: string | null;
    yesPrice: number | null;
    /** Unix seconds, as the provider reports it. */
    expiresAt: number | null;
  };
  conditions: ConditionsView | null;
  base: {
    direction: Direction | null;
    confidence: number | null;
    reason: string | null;
    shares: number | null;
    price: number | null;
  };
  decision: {
    direction: Direction | null;
    baseConfidence: number | null;
    memoryInfluence: number | null;
    finalConfidence: number | null;
    memoryIds: string[];
    reasoning: string[];
  };
  risk: {
    approved: boolean | null;
    reasons: string[];
    collateral: number | null;
  };
  retrieved: RetrievedMemoryView[];
  /** The memory this decision produced, when one was stored. */
  experienceId: string | null;
}

/**
 * Build the current-decision view from the most recent `preview` event.
 *
 * The orchestrator writes one `preview` event per session with the full
 * reasoning chain attached, so this is the authoritative record of what the
 * agent decided and why. Returns null when no session has run.
 */
export function deriveLatestDecision(
  events: AgentEvent[],
  experiences: Experience[],
): DecisionView | null {
  const previews = events
    .filter((e) => e.type === 'preview' && typeof e.at === 'string')
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));
  const ev = previews[0];
  if (!ev) return null;
  return toDecisionView(ev, experiences);
}

export function deriveDecisionHistory(
  events: AgentEvent[],
  experiences: Experience[],
  limit = 40,
): DecisionView[] {
  return events
    .filter((e) => e.type === 'preview' && typeof e.at === 'string')
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, limit)
    .map((e) => toDecisionView(e, experiences));
}

function toDecisionView(ev: AgentEvent, experiences: Experience[]): DecisionView {
  const byId = new Map(experiences.map((e) => [e.id, e]));
  const market = obj(ev.market);
  const intent = obj(ev.intent);
  const decision = obj(ev.decision);
  const risk = obj(ev.risk);
  const conditions = obj(ev.conditions);
  const retrieved = Array.isArray(ev.retrieved) ? ev.retrieved : [];

  return {
    at: String(ev.at),
    state: str(ev.state),
    market: {
      id: str(market.id),
      title: str(market.title),
      asset: str(market.asset),
      timeframe: str(market.timeframe),
      yesPrice: num(market.yesPrice),
      expiresAt: num(market.expiresAt),
    },
    conditions: conditions.asset
      ? {
          asset: String(conditions.asset),
          timeframe: String(conditions.timeframe ?? ''),
          yesPrice: num(conditions.yesPrice),
          midpointDistance: num(conditions.midpointDistance),
          volatility: str(conditions.volatility),
          momentum: str(conditions.momentum),
          liquidity: str(conditions.liquidity),
          timeRemainingBucket: str(conditions.timeRemainingBucket),
        }
      : null,
    base: {
      direction: dir(intent.direction),
      confidence: num(intent.baseConfidence),
      reason: str(intent.reason),
      shares: num(intent.shares),
      price: num(intent.price),
    },
    decision: {
      direction: dir(decision.decision) ?? dir(intent.direction),
      baseConfidence: num(decision.baseConfidence),
      memoryInfluence: num(decision.memoryInfluence),
      finalConfidence: num(decision.finalConfidence),
      memoryIds: strArray(decision.memoryIds),
      reasoning: strArray(decision.reasoning),
    },
    risk: {
      approved: typeof risk.approved === 'boolean' ? risk.approved : null,
      reasons: strArray(risk.reasons),
      collateral: num(risk.collateral),
    },
    retrieved: retrieved
      .map((entry): RetrievedMemoryView | null => {
        const r = obj(entry);
        const exp = obj(r.experience);
        const id = str(exp.id);
        if (!id) return null;
        const outcomeObj = obj(exp.outcome);
        const full = byId.get(id) ?? null;
        return {
          experienceId: id,
          outcome: (str(outcomeObj.outcome) as Outcome) ?? 'PENDING',
          pnl: num(outcomeObj.pnl) ?? 0,
          lesson: str(outcomeObj.lesson) ?? '',
          similarity: num(r.similarity) ?? 0,
          retrievalScore: num(r.retrievalScore) ?? 0,
          isScar: r.isScar === true,
          isPattern: r.isPattern === true,
          asset: full?.asset ?? null,
          timeframe: full?.timeframe ?? null,
          direction: full?.decision.direction ?? null,
          createdAt: full?.createdAt ?? null,
        };
      })
      .filter((r): r is RetrievedMemoryView => r !== null)
      .sort((a, b) => b.retrievalScore - a.retrievalScore),
    experienceId: str(ev.experienceId),
  };
}

/* -------------------------------------------------------------------------- */
/* Activity                                                                    */
/* -------------------------------------------------------------------------- */

export interface ActivityItem {
  at: string;
  /** Short human sentence describing the recorded event. */
  what: string;
  /** Mono detail line; null when the event carries nothing extra worth showing. */
  detail: string | null;
  href: string | null;
}

/**
 * Turn the raw event log into a readable trail.
 *
 * One recorded event can be worth more than one line — a preview event carries
 * the retrieval count and the decision, which are two distinct things the agent
 * did. Every line corresponds to a value actually present in the log; none are
 * synthesized to make the feed look busier.
 */
export function deriveActivity(events: AgentEvent[], limit = 24): ActivityItem[] {
  const items: ActivityItem[] = [];

  for (const ev of events) {
    if (!ev || typeof ev.at !== 'string') continue;
    const at = ev.at;

    if (ev.type === 'preview') {
      const market = obj(ev.market);
      const decision = obj(ev.decision);
      const risk = obj(ev.risk);
      const retrieved = Array.isArray(ev.retrieved) ? ev.retrieved : [];
      const label = marketLabel(str(market.asset), str(market.timeframe));

      items.push({
        at,
        what: `Market observed${label ? ` — ${label}` : ''}`,
        detail: str(market.title) ?? str(market.id),
        href: '/market',
      });

      if (retrieved.length > 0) {
        items.push({
          at,
          what: `${retrieved.length} similar ${retrieved.length === 1 ? 'experience' : 'experiences'} retrieved`,
          detail: null,
          href: '/decision',
        });
      }

      const finalConfidence = num(decision.finalConfidence);
      const dirName = dir(decision.decision);
      if (dirName) {
        items.push({
          at,
          what: `Decision generated — ${dirName === 'NO_TRADE' ? 'NO TRADE' : dirName}`,
          detail:
            finalConfidence !== null
              ? `${(finalConfidence * 100).toFixed(0)}% confidence`
              : null,
          href: '/decision',
        });
      }

      if (risk.approved === false) {
        items.push({
          at,
          what: 'Risk engine rejected the order',
          detail: strArray(risk.reasons)[0] ?? null,
          href: '/decision',
        });
      }

      const experienceId = str(ev.experienceId);
      if (experienceId) {
        items.push({
          at,
          what: 'Memory created',
          detail: experienceId,
          href: `/memory/${experienceId}`,
        });
      }
      continue;
    }

    if (ev.type === 'order_submitted') {
      const collateral = num(ev.collateral);
      items.push({
        at,
        what: `Order submitted — ${str(ev.direction) ?? '—'}`,
        detail: [
          str(ev.marketId),
          collateral !== null ? `$${collateral.toFixed(2)} USDC` : null,
        ]
          .filter(Boolean)
          .join(' · ') || null,
        href: '/trades',
      });
      continue;
    }

    if (ev.type === 'approval_submitted') {
      items.push({
        at,
        what: 'USDC spend approved',
        detail: str(ev.hash),
        href: '/trades',
      });
      continue;
    }

    // Unknown event types are still real activity. Show the type verbatim
    // rather than dropping data the agent chose to record.
    items.push({ at, what: String(ev.type), detail: null, href: null });
  }

  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/* -------------------------------------------------------------------------- */
/* Trades                                                                      */
/* -------------------------------------------------------------------------- */

export interface TradeView {
  /** Transaction hash — the stable identity of a submitted order. */
  txHash: string | null;
  at: string;
  marketId: string | null;
  direction: Direction | null;
  shares: number | null;
  price: number | null;
  collateral: number | null;
  state: string | null;
  /** The experience recorded for this market, when one exists. */
  experience: Experience | null;
}

/**
 * Submitted orders, newest first, joined to the experience the agent stored for
 * the same market. The join is by market id because that is the only key the
 * order event and the experience share.
 */
export function deriveTrades(events: AgentEvent[], experiences: Experience[]): TradeView[] {
  const orders = events
    .filter((e) => e.type === 'order_submitted' && typeof e.at === 'string')
    .sort((a, b) => String(b.at).localeCompare(String(a.at)));

  // Multiple orders can touch the same market; pair each order with the
  // experience recorded closest to it in time so the stories do not cross.
  const byMarket = new Map<string, Experience[]>();
  for (const exp of experiences) {
    const list = byMarket.get(exp.marketId) ?? [];
    list.push(exp);
    byMarket.set(exp.marketId, list);
  }
  for (const list of byMarket.values()) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  const claimed = new Set<string>();

  return orders.map((ev) => {
    const marketId = str(ev.marketId);
    let experience: Experience | null = null;
    if (marketId) {
      const candidates = byMarket.get(marketId) ?? [];
      const orderTime = new Date(String(ev.at)).getTime();
      let bestDelta = Infinity;
      for (const c of candidates) {
        if (claimed.has(c.id)) continue;
        const delta = Math.abs(new Date(c.createdAt).getTime() - orderTime);
        if (delta < bestDelta) {
          bestDelta = delta;
          experience = c;
        }
      }
      if (experience) claimed.add(experience.id);
    }

    return {
      txHash: str(ev.hash),
      at: String(ev.at),
      marketId,
      direction: dir(ev.direction),
      shares: num(ev.quantity),
      price: num(ev.price),
      collateral: num(ev.collateral),
      state: str(ev.state),
      experience,
    };
  });
}

/* -------------------------------------------------------------------------- */
/* Performance                                                                 */
/* -------------------------------------------------------------------------- */

export interface TrailPoint {
  at: string;
  pnl: number;
  cumulative: number;
  outcome: Outcome;
  experienceId: string;
}

/**
 * Cumulative realized PnL across settled experiences, oldest first.
 *
 * Only settled experiences are included: a pending position has no realized
 * result, and plotting it as zero would draw a flat line that does not exist.
 */
export function derivePnlTrail(experiences: Experience[]): TrailPoint[] {
  const settled = experiences
    .filter((e) => e.outcome.outcome !== 'PENDING')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  let cumulative = 0;
  return settled.map((e) => {
    cumulative += e.outcome.pnl;
    return {
      at: e.createdAt,
      pnl: e.outcome.pnl,
      cumulative,
      outcome: e.outcome.outcome,
      experienceId: e.id,
    };
  });
}

/**
 * Largest peak-to-trough decline of the cumulative realized PnL curve.
 * Null when there is not enough settled history for the number to mean
 * anything.
 */
export function deriveMaxDrawdown(trail: TrailPoint[]): number | null {
  if (trail.length < 2) return null;
  let peak = trail[0]!.cumulative;
  let maxDd = 0;
  for (const p of trail) {
    if (p.cumulative > peak) peak = p.cumulative;
    const dd = peak - p.cumulative;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd;
}

/* -------------------------------------------------------------------------- */
/* Memory shaping                                                              */
/* -------------------------------------------------------------------------- */

export interface MemoryStats {
  total: number;
  wins: number;
  losses: number;
  pending: number;
  surprising: number;
  /** Mean importance across all experiences, or null when there are none. */
  avgImportance: number | null;
  /** Distinct condition fingerprints seen, i.e. how varied the experience is. */
  distinctConditions: number;
}

export function deriveMemoryStats(experiences: Experience[]): MemoryStats {
  const tags = new Set<string>();
  let wins = 0;
  let losses = 0;
  let pending = 0;
  let surprising = 0;
  let importanceSum = 0;

  for (const e of experiences) {
    if (e.outcome.outcome === 'WIN') wins++;
    else if (e.outcome.outcome === 'LOSS') losses++;
    else pending++;
    if (e.surprising) surprising++;
    importanceSum += e.importance;
    for (const t of e.tags) tags.add(t);
  }

  return {
    total: experiences.length,
    wins,
    losses,
    pending,
    surprising,
    avgImportance: experiences.length > 0 ? importanceSum / experiences.length : null,
    distinctConditions: tags.size,
  };
}

/* -------------------------------------------------------------------------- */
/* Coercion helpers                                                            */
/* -------------------------------------------------------------------------- */
/* The event log is untyped JSON written by the agent. These helpers read it
   defensively: a missing or malformed field becomes null, never a fabricated
   default such as 0 or 'unknown'. */

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.length > 0 ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function dir(v: unknown): Direction | null {
  return v === 'YES' || v === 'NO' || v === 'NO_TRADE' ? v : null;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function marketLabel(asset: string | null, timeframe: string | null): string {
  if (asset && timeframe) return `${asset} ${timeframe}`;
  return asset ?? timeframe ?? '';
}
