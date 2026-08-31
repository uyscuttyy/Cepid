/**
 * Display formatting.
 *
 * Every formatter takes the possibility of "no value" seriously: null and
 * non-finite input render as an em dash rather than as 0, 0%, or $0.00. A
 * missing number and a zero number mean different things in this product.
 */
import type { Outcome, Direction } from './types.js';

export const DASH = '—';

export function formatUsdc(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs < 0.01 && abs > 0) return `${sign}$${abs.toFixed(4)}`;
  if (abs < 1) return `${sign}$${abs.toFixed(3)}`;
  return `${sign}$${abs.toFixed(2)}`;
}

/** Signed USDC — used wherever the sign itself is the information (PnL). */
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

export function formatPrice(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return DASH;
  return n.toFixed(3);
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

/**
 * Wall-clock time for the activity trail. Fixed locale and 24-hour clock so the
 * server-rendered string matches what the client would produce — a mismatch here
 * is a hydration error, not a cosmetic difference.
 */
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

export function formatDay(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return DASH;
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Unix seconds (as the market provider reports expiry) to a countdown. */
export function formatTimeRemaining(
  expiresAtSeconds: number | null | undefined,
  now = Date.now(),
): string {
  if (expiresAtSeconds === null || expiresAtSeconds === undefined) return DASH;
  if (!Number.isFinite(expiresAtSeconds)) return DASH;
  const seconds = Math.floor(expiresAtSeconds - now / 1000);
  if (seconds <= 0) return 'Expired';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatAddress(addr: string | null | undefined, head = 6, tail = 4): string {
  if (!addr) return DASH;
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

/** Short form of a memory id: `exp-30cefdbf-d06` reads as `30cefdbf`. */
export function shortId(id: string | null | undefined): string {
  if (!id) return DASH;
  const parts = id.split('-');
  if (parts.length >= 2 && parts[1]) return parts[1];
  return id.slice(0, 8);
}

export function directionLabel(d: Direction | null | undefined): string {
  if (!d) return DASH;
  return d === 'NO_TRADE' ? 'NO TRADE' : d;
}

export function outcomeKind(o: Outcome | null | undefined): 'win' | 'loss' | 'pending' {
  if (o === 'WIN') return 'win';
  if (o === 'LOSS') return 'loss';
  return 'pending';
}

export function trendOf(
  n: number | null | undefined,
  eps = 1e-6,
): 'pos' | 'neg' | 'flat' {
  if (n === null || n === undefined || !Number.isFinite(n)) return 'flat';
  if (n > eps) return 'pos';
  if (n < -eps) return 'neg';
  return 'flat';
}

/**
 * Trend as a `Metric` tone. A flat or unknown value reads as muted rather than
 * borrowing the positive color for zero.
 */
export function pnlTone(
  n: number | null | undefined,
): 'pos' | 'neg' | 'muted' {
  const t = trendOf(n);
  return t === 'flat' ? 'muted' : t;
}

/** Human label for the network id the agent is configured with. */
export function networkLabel(network: string | null | undefined): string {
  switch (network) {
    case 'base':
      return 'Base';
    case 'base-sepolia':
      return 'Base Sepolia';
    case 'mock':
      return 'Simulated';
    default:
      return network ?? DASH;
  }
}

/** Ordinal position on a three-step qualitative scale (low / medium / high). */
export function scaleIndex(value: string | null | undefined): number | null {
  switch (value) {
    case 'low':
    case 'down':
      return 1;
    case 'medium':
    case 'flat':
      return 2;
    case 'high':
    case 'up':
      return 3;
    default:
      return null;
  }
}

export function titleCase(v: string | null | undefined): string {
  if (!v) return DASH;
  return v.charAt(0).toUpperCase() + v.slice(1);
}

/**
 * The scan-level identity of a market position: `BTC 15M · YES`.
 *
 * Only the parts that exist are rendered — a memory whose experience has been
 * pruned from the store still shows its direction, and vice versa.
 */
export function marketOf(
  asset: string | null | undefined,
  timeframe: string | null | undefined,
  direction?: Direction | null,
): string {
  const pair = [asset, timeframe].filter(Boolean).join(' ');
  const dirLabel = direction ? directionLabel(direction) : null;
  if (pair && dirLabel) return `${pair} · ${dirLabel}`;
  return pair || dirLabel || DASH;
}
