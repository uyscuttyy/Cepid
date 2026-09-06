# Constraint Gate

The deterministic ALLOW/DENY layer between memory retrieval and the
agent's decision. The gate is the control surface of CEPID: a DENY
means the agent must not trade, sign, or touch the market.

## Where it runs

Inside `POST /v1/memories/query`, after retrieval + ranking, before
the response is returned. Every retrieve response carries:

```json
{
  "retrievalId": "ret-…",
  "memories": [ … ],
  "verdict": "ALLOW",
  "reason": "no memories retrieved",
  "usedMemoryIds": [],
  "blockingMemoryIds": [],
  "blockedBy": "none",
  "matchedSignature": null
}
```

`verdict` is machine-checkable: exactly `ALLOW` or `DENY`. No
free-form text ever permits a trade.

The verdict is also written onto the retrieval row
(`gateVerdict`, `gateReason`, `gateBlockingMemoryIds`), so
`POST /v1/decisions` surfaces it in the `decision.recorded` journal
event and response without trusting the client. A `gate.denied` event
is appended whenever the verdict is DENY.

## Blocking criteria (priority order)

Computed by `evaluateGate()` in `cepid/src/memory/constraint-gate.ts`.
Pure function: no I/O, no randomness, no clock. Same input → same
verdict, every time.

### 1. Scar — `blockedBy: "scar"`

A `ScarRecord` with `strength ≥ 0.6` whose linked pattern's
`signature` equals the current situation's signature fires. Blocking
ids are the union of the scar's `memoryIds` and its pattern's
`memoryIds` (the scar is built from the pattern; both explain why).

What constitutes a scar: see `cepid/src/memory/scars.ts` — a pattern
with `bad ≥ 3`, `badRate ≥ 0.55`, `meanMagnitude ≤ -0.01` becomes a
scar at strength 0.7. Scars decay at 25% of the ordinary rate.

What makes a scar relevant: exact signature equality between the
scar's pattern and the current situation. The signature is
`domain|sorted-facets` (`situationSignature()`); text is deliberately
excluded. A scar from another domain or facet shape never matches —
tenant isolation is preserved because the gate only ever sees the
caller's own patterns and scars.

### 2. Pattern — `blockedBy: "pattern"`

A `PatternRecord` with `badRate ≥ 0.66`, `bad ≥ 3`,
`meanMagnitude ≤ -0.01`, and matching signature fires. Blocking ids
are the pattern's `memoryIds`. This is the earlier trip-wire: the
pattern is bad enough to block even before a scar row exists.

### 3. Bad experience — `blockedBy: "bad-experience"`

A retrieved memory with `outcome.valence === "bad"` and facet
similarity `≥ 0.7` to the current situation fires. Blocking ids are
those memories. This covers the single-loss case: one materially
similar failure is enough evidence to stop a repeat.

### 4. Otherwise — ALLOW, `blockedBy: "none"`

The `reason` records what the gate saw:

- `no memories retrieved` — nothing to judge;
- `N retrieved memories, none with a blocking outcome` — evidence exists but none blocks;
- `bad-outcome memory present but below the 70% similarity threshold` — weak evidence.

## Conflicting memories

A mix of good and bad retrieved memories resolves to DENY if any bad
memory meets criterion 3, else ALLOW. A single materially similar
failure outweighs any number of dissimilar successes — the gate errs
toward preventing a repeat. Scar/pattern matches outrank single
memories (higher-confidence evidence first).

## What the agent must do

- Read `verdict` first. On `DENY`: set intent `NO_TRADE`, skip risk
  evaluation bypass concerns, skip `placeOrder`, skip `getResolution`.
  Do not sign. Do not broadcast. Do not call the market contract.
- Still record: `recordDecision()` with the retrieval edge (the
  platform enforces `INFLUENCE_NOT_SUPPORTED` as usual), then an
  outcome or a blocked-decision record, so the influence chain stays
  inspectable: retrieval → used memories → decision → verdict →
  outcome.

The demo agent (`agents/demo-trader/src/app.ts`) implements exactly
this: the gate branch short-circuits everything market-facing and
forces `NO_TRADE` with the gate's reason in the decision reasoning.

## What "scar" means for the two-run demo

Run 1 records three YES trades that lose on-chain. Each settled LOSS
backfills its PENDING experience (field-based for new rows, journal
fallback for older ones), the linker forms a pattern (3 settled, same
signature, badRate 1.0), and the scar criterion is met (bad ≥ 3,
badRate ≥ 0.55, meanMagnitude ≤ −0.01). Run 2 retrieves the same
signature, the gate matches the scar, verdict DENY, no transaction.

No run-number checks, no hardcoded memory ids, no hardcoded verdicts
anywhere in this path. The demo proves the mechanism.

## Threshold rationale

- `0.6` scar strength: scars are born at 0.7 and fade 0.1 per
  non-qualifying recompute — 0.6 admits fresh scars and recently
  faded ones, nothing weaker.
- `0.66` pattern badRate / `3` bad: two-to-one bad majority over at
  least three samples — the smallest sample that isn't anecdote.
- `0.7` similarity: the retriever's own strong-match band; below it
  the memory is a different situation, not a warning about this one.

These are documented defaults, not law. They live as exported
constants (`SCAR_STRENGTH_MIN`, `PATTERN_BAD_RATE_MIN`,
`PATTERN_BAD_COUNT_MIN`, `PATTERN_MEAN_MAGNITUDE_MAX`,
`BAD_EXPERIENCE_SIMILARITY_MIN`) so tests and operators cite the same
numbers as the code.

## Security assumptions

- The gate only reads the caller's tenant (patterns, scars, memories
  all come from tenant-scoped repo calls). Cross-tenant blocking is
  impossible by construction; `constraint-gate.test.ts` pins the
  different-signature case.
- The verdict on a decision comes from the retrieval ROW, not the
  request body. A client cannot claim ALLOW.
- x402 still gates retrieval itself: the gate runs on paid results
  like any other. No free path around payment was added.
