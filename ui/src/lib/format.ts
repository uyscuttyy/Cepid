/**
 * Display formatting — honest about what's there and what isn't.
 *
 * The CEPID UI is domain-agnostic: agents supply their own action vocabulary
 * and outcome metrics, so the formatters below either consume the generic
 * shape or stay profile-neutral. Anything that would have to know about
 * trading (YES/NO, ETH/BTC, PnL) was removed when the schema generalized.
 */
import type { MemoryRecord } from './cepid';

export const DASH = '—';

export function formatUsdc(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs < 0.01 && abs > 0) return `${sign}$${abs.toFixed(4)}`;
  if (abs < 1) return `${sign}$${abs.toFixed(3)}`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function formatUsdcSigned(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  const body = formatUsdc(Math.abs(n));
  if (n > 0) return `+${body}`;
  if (n < 0) return `-${body}`;
  return body;
}

export function formatPercent(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  return `${(n * 100).toFixed(digits)}%`;
}

export function formatPctSigned(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  const sign = n > 0 ? '+' : '';
  return `${sign}${(n * 100).toFixed(digits)}%`;
}

export function formatCount(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  return n.toLocaleString('en-US');
}

export function formatRelative(iso: string | null | undefined, now = new Date()): string {
  if (!iso) return DASH;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return DASH;
  const ms = now.getTime() - t;
  if (ms < 0) return 'just now';
  if (ms < 45_000) return 'moments ago';
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  if (ms < 7 * 86_400_000) return `${Math.floor(ms / 86_400_000)}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatClock(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return DASH;
  return d.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return DASH;
  return `${d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })} · ${formatClock(iso)} UTC`;
}

export function formatAddress(addr: string | null | undefined, head = 6, tail = 4): string {
  if (!addr) return DASH;
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function shortId(id: string | null | undefined): string {
  if (!id) return DASH;
  const parts = id.split('-');
  if (parts.length >= 2 && parts[1]) return parts[1];
  return id.slice(0, 8);
}

/** Trend as pos/neg/flat for tone. Flat (including unknown) reads as muted. */
export function trendOf(
  n: number | null | undefined,
  eps = 1e-6,
): 'pos' | 'neg' | 'flat' {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'flat';
  if (n > eps) return 'pos';
  if (n < -eps) return 'neg';
  return 'flat';
}

/** Generic outcome label: good/bad/neutral, profile-neutral. */
export function outcomeTone(outcome: { valence: 'good' | 'bad' | 'neutral' } | null | undefined): 'pos' | 'neg' | 'muted' {
  if (!outcome) return 'muted';
  if (outcome.valence === 'good') return 'pos';
  if (outcome.valence === 'bad') return 'neg';
  return 'muted';
}

export function outcomeLabel(outcome: { result: string; valence: 'good' | 'bad' | 'neutral' } | null | undefined): string {
  if (!outcome) return DASH;
  return outcome.result;
}

/** Summarise a memory in one line for the rail/list. */
export function memoryHeadline(m: MemoryRecord): string {
  const action = m.action || m.decision.action || DASH;
  return `${m.situation.text || m.situation.domain} → ${action}`;
}
