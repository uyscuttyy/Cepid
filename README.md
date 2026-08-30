# CEPID

**Continuity Experience & Persistent Institutional Decision-memory**

A trading agent that accumulates experiential memory and uses it to change future decisions. Built for the Sibyl Memory Hackathon.

## The problem

Most trading agents operate like this:

    Market → Analyze → Decide → Trade → Forget

They keep a trade history, but that history doesn't participate in future reasoning. Every market is encountered as if for the first time.

## What CEPID is

CEPID is a trading agent with persistent experiential memory. For every meaningful decision, it captures:

- The **market conditions** (asset, timeframe, price, volatility, momentum, liquidity, time remaining, indicators)
- The **decision context** (direction, base confidence, memory influence, final confidence, reasoning)
- The **execution** (entry price, shares, slippage, transaction hash)
- The **outcome** (win/loss, realized PnL, settlement result, actual vs expected)
- The **experience itself** (extracted lesson, importance, surprise, memory strength, tags)

When the agent encounters a new market, it retrieves the most relevant past experiences, weighs them (with extra weight on "scars" — repeated losses under similar conditions), and adjusts the final decision. The decision engine then produces a structured explanation of how memory influenced the choice.

The loop:

    Experience → Memory → Retrieval → Behavior change → New experience → Updated memory

is real, persistent, testable, and visible.

## What CEPID is NOT

- Not a marketplace, competition, ranking, arena, or agent registry
- Not an LLM-dependent system (V1 is fully deterministic; the architecture leaves room for an LLM extractor later)
- Not a paper-trading toy (it executes real testnet transactions on Base when configured to)

## Quick start

```bash
# 1. Install
npm install

# 2. Configure
cp .env.example .env
# Edit .env: set AGENT_PRIVATE_KEY, CEPID_RPC_URL_BASE_SEPOLIA, CEPID_MAX_COLLATERAL, etc.
# For a no-network run, set CEPID_NETWORK=mock and leave the key blank.

# 3. Run tests
npm test

# 4. Preview a single decision
npm run agent:preview

# 5. Execute (requires --confirm-approval and --confirm-order)
npm run agent:execute
```

## Architecture

```
src/
  config/         - Environment loading, AgentConfig type
  market/         - MarketProvider interface + three implementations
    provider.ts       - The abstraction
    mock-provider.ts  - Deterministic, for tests only
    limitless-provider.ts    - Limitless Exchange on Base mainnet
    base-sepolia-test-provider.ts - Self-hosted minimal market on Base Sepolia
    limitless-orders.ts       - EIP-712 sign + POST /orders
  memory/         - The product core
    schema.ts / types in config/types.ts - Experience, Pattern, Scar
    importance.ts    - How important a memory is
    similarity.ts    - Vector distance between market contexts
    repository.ts    - JSON-backed persistent store
    retriever.ts     - Ranked retrieval with scar/pattern boosts
    linker.ts        - Pattern detection across experiences
    scars.ts         - Scar lifecycle
    decay.ts         - Strength weakening over time
    evaluator.ts     - decision+outcome → Experience
  strategy/       - Replaceable strategies + market context derivation
  decision/       - Memory-informed decision engine
  risk/           - Hard guardrails (per-order, per-session, market validity)
  execution/      - (reserved for explicit execution flow; currently inside app.ts)
  sessions/       - Agent session persistence
  persistence/    - File repositories
  app.ts          - Orchestrator (the main loop)
  cli/            - CLI entrypoint
```

The agent pipeline:

    MarketProvider → MarketSnapshot → MarketContext → Memory Retrieval →
    Base Strategy + Memory Influence → TradeIntent → Risk → Execution →
    Outcome → Memory Evaluator → MemoryRepository

The MarketProvider interface is the seam between CEPID and the world. The agent does not know whether it's talking to Limitless, the Base Sepolia test market, or a mock.

## Memory model

Every meaningful experience becomes an `Experience` with:

- `conditions` — normalized market context
- `decision` — what the agent decided, including memory influence
- `execution` — fill details
- `outcome` — win/loss/PENDING, pnl, lesson
- `importance` — deterministic score in [0, 1]
- `surprising` — whether the outcome defied the agent's expectation
- `strength` — current activation; decays unless reinforced
- `tags` — coarse fingerprints (e.g. `BTC|15M|vol:high|mom:up|liq:medium|time:>10m`)

Patterns emerge from repeated co-occurring tags. Scars are created when a pattern's win rate stays below 35% and its average PnL is negative. Scars decay more slowly (25% of ordinary rate) and receive a retrieval boost.

## The thesis test

The most important test in the suite (`test/memory-influence.test.ts`):

> Given the same market conditions, the base strategy produces BUY_YES when no relevant memory exists, and NO_TRADE when the agent has accumulated scars from similar losing setups.

This test is non-negotiable. If it ever fails, the product thesis is broken.

## Networks

| Setting         | Behavior                                                                 |
| --------------- | ------------------------------------------------------------------------ |
| `mock`          | In-memory markets and fills. No network. For tests and offline iteration.|
| `base-sepolia`  | Self-hosted minimal market contract on Base Sepolia. Real testnet USDC.  |
| `base`          | Limitless Exchange on Base mainnet. Production path; small amounts only. |

Limitless Exchange has no testnet deployment. The `base-sepolia` path exists to give the agent a real on-chain environment for the Sibyl demo. See `contracts/CepidTestMarket.sol` for the minimal market contract.

## Setup for Base Sepolia (recommended for the demo)

```bash
# 1. Install Foundry
curl -L https://foundry.paradigm.xyz | bash

# 2. Deploy the test market
cd contracts
forge install OpenZeppelin/openzeppelin-contracts --no-commit
forge create --rpc-url https://sepolia.base.org --private-key $AGENT_PRIVATE_KEY \
  --constructor-args 0x036CbD53842c5426634e7929541eC2318f3dCF7e BTC 15M 900 1 \
  contracts/CepidTestMarket.sol:CepidTestMarket
# Copy the deployed address → CEPID_TEST_MARKET_ADDRESS in .env

# 3. Fund the market with testnet USDC
# (Use the Base Sepolia USDC faucet; then transfer + call fund() so redemptions can pay out)

# 4. Run the agent
cd ..
CEPID_NETWORK=base-sepolia npm run agent:preview
```

## Setup for Limitless (production path)

```bash
# 1. Get a Limitless API token at https://limitless.exchange → API Tokens
# 2. Set LMTS_TOKEN_ID, LMTS_TOKEN_SECRET, LMTS_OWNER_ID in .env
# 3. CEPID_NETWORK=base npm run agent:execute
```

Limitless has no testnet — small live orders are the only rehearsal strategy they officially support.

## Safety

- Default mode is **preview** (no transactions broadcast).
- Execution requires both `--confirm-approval` and `--confirm-order` flags.
- The risk engine sits between decision and execution and is never bypassed by memory.
- Private keys are loaded from environment only, never logged, never committed.
- Limits enforced: per-order collateral cap, per-session collateral cap, per-session order count, market active/expired status, price bounds, minimum order size, allowed assets/timeframes.

## Demo

A two-session reproduction (session 1 trades, session 2 sees memory change behavior) is implemented as a unit test in `test/session-restart.test.ts`. The end-to-end CLI flow:

```bash
# Session 1: trade, lose, learn
CEPID_DATA_DIR=./data CEPID_NETWORK=mock npm run agent:execute -- --confirm-approval --confirm-order
# (Directly seed LOSS experiences, or run until a loss happens)

# Session 2: same market, memory should veto
CEPID_DATA_DIR=./data CEPID_NETWORK=mock npm run agent:preview
```

## Documentation

- `prd.md` — product requirements and scope
- `project-plan.md` — implementation phases and progress
- `handoff.md` — current state, audit findings, what's done
- `memory.md` — engineering/product decisions and persistent knowledge
