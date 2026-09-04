/**
 * UI-facing types. These mirror the platform's domain types but are kept in
 * the UI so the dashboard doesn't import from `@cepid/server` — the seam is
 * the HTTP boundary, and the dashboard's view of memory is its own concern.
 *
 * If the platform schema changes, this file changes with it (and the tests
 * in test/cepid-client.test.ts catch the divergence at build time).
 */
export type {
  AgentRecord,
  Situation,
  MemoryRecord,
  MemoryOutcome,
  MemoryKind,
  MemoryEdge,
  PatternRecord,
  ScarRecord,
  AgentHistory,
  AgentEvent,
  ActivityResponse,
  UsageRow,
  UsageResponse,
  ReadinessResponse,
  RegisterResponse,
} from './cepid';
