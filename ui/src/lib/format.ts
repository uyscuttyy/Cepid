/**
 * Display formatting helpers.
 */
import type { Outcome, Direction } from './types.js';

export function formatUsdc(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs < 0.01) return `${sign}$${abs.toFixed(4)}`;
  if (abs < 1) return `${sign}$${abs.toFixed(3)}`;
  return `${sign}$${abs.toFixed(2)}`;
}

export function formatPercent(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}

export function formatPctSigned(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  const sign = n > 0 ? '+' : n < 0 ? '' : '';
  return `${sign}${(n * 100).toFixed(digits)}%`;
}

export function formatPrice(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(3);
}

export function formatRelative(iso: string, now = new Date()): string {
  const t = new Date(iso).getTime();
  const ms = now.getTime() - t;
  if (ms < 0) return new Date(iso).toLocaleString();
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s ago`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ago`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}h ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export function formatAddress(addr: string | null, head = 6, tail = 4): string {
  if (!addr) return '—';
  if (addr.length <= head + tail + 2) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

export function directionLabel(d: Direction): string {
  return d === 'NO_TRADE' ? 'NO TRADE' : d;
}

export function outcomeKind(o: Outcome): 'win' | 'loss' | 'pending' {
  if (o === 'WIN') return 'win';
  if (o === 'LOSS') return 'loss';
  return 'pending';
}

export function trendOf(n: number, eps = 1e-6): 'up' | 'down' | 'neutral' {
  if (n > eps) return 'up';
  if (n < -eps) return 'down';
  return 'neutral';
}
