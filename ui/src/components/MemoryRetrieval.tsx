import Link from 'next/link';
import type { RetrievedMemoryView } from '@/lib/view';
import { Chip, EmptyState, OutcomeMark } from './Primitives';
import {
  formatPercent,
  formatRelative,
  formatUsdcSigned,
  marketOf,
  shortId,
  trendOf,
} from '@/lib/format';

/**
 * MEMORY RETRIEVAL — the signature component.
 *
 * When CEPID decides, it first looks for experiences that resemble the market
 * in front of it. This renders that search as a trail: each retrieved
 * experience is a node hanging off a vertical spine, ordered by how strongly it
 * was retrieved.
 *
 * The encoding is deliberate and readable without color:
 *   - The similarity percentage is the leading value, with a small bar beneath.
 *   - Nodes above the strong threshold get a filled marker and a brighter
 *     connector; weaker matches stay hollow.
 *   - The outcome carries a distinct shape per state (square / diamond / ring).
 *   - Scar and pattern membership are explicit chips, not color hints.
 *
 * Expanding a node reveals the lesson the agent wrote and a link into the full
 * experience. Nothing animates on a timer: the retrieval already happened, and
 * pretending to search live would be theatre.
 */

/** Above this retrieval score a memory is treated as a strong match. */
const STRONG_MATCH = 0.7;

export function MemoryRetrieval({
  retrieved,
  /** Rendered above the list; omit on pages that supply their own heading. */
  showHead = true,
}: {
  retrieved: RetrievedMemoryView[];
  showHead?: boolean;
}) {
  if (retrieved.length === 0) {
    return (
      <EmptyState
        title="No similar experiences"
        body="CEPID found nothing in memory close enough to these conditions to draw on. This decision rests on the base strategy alone — which is what a first encounter looks like."
      />
    );
  }

  const strong = retrieved.filter((r) => r.retrievalScore >= STRONG_MATCH).length;
  const wins = retrieved.filter((r) => r.outcome === 'WIN').length;
  const losses = retrieved.filter((r) => r.outcome === 'LOSS').length;

  return (
    <div className="retrieval">
      {showHead && (
        <div className="retrieval__head">
          <span className="retrieval__count mono">{retrieved.length}</span>
          <span className="label">
            similar {retrieved.length === 1 ? 'experience' : 'experiences'} retrieved
          </span>
          <span className="band__hint">
            {strong > 0 && `${strong} strong · `}
            {wins}W · {losses}L
          </span>
        </div>
      )}

      <div className="retrieval__list">
        {retrieved.map((r) => (
          <MemoryNode key={r.experienceId} memory={r} />
        ))}
      </div>
    </div>
  );
}

function MemoryNode({ memory }: { memory: RetrievedMemoryView }) {
  const strong = memory.retrievalScore >= STRONG_MATCH;
  const market = marketOf(memory.asset, memory.timeframe, memory.direction);
  const pnlTone = trendOf(memory.pnl);

  return (
    <details className="memory-node" data-strong={strong ? 'true' : 'false'}>
      <summary className="memory-node__summary">
        <span className="memory-node__sim">
          <span className="memory-node__sim-value">
            {formatPercent(memory.similarity)}
          </span>
          <span className="memory-node__sim-bar" aria-hidden="true">
            <span style={{ width: `${Math.min(100, memory.similarity * 100)}%` }} />
          </span>
          <span className="visually-hidden">
            {formatPercent(memory.similarity)} similarity
          </span>
        </span>

        <span className="memory-node__body">
          <span className="memory-node__line">
            <span className="memory-node__market">{market}</span>
            {memory.isScar && <Chip tone="neg">scar</Chip>}
            {memory.isPattern && <Chip tone="blue">pattern</Chip>}
          </span>
          {memory.lesson && (
            <span className="memory-node__lesson">{memory.lesson}</span>
          )}
        </span>

        <span className="memory-node__aside">
          <OutcomeMark outcome={memory.outcome} />
          <span className={`mono num-${pnlTone}`} style={{ fontSize: 'var(--fs-small)' }}>
            {memory.outcome === 'PENDING' ? '—' : formatUsdcSigned(memory.pnl)}
          </span>
          <span className="memory-node__toggle" aria-hidden="true">
            +
          </span>
        </span>
      </summary>

      <div className="memory-node__detail">
        <dl className="kv">
          <div className="kv__row">
            <dt className="kv__key">Memory</dt>
            <dd className="kv__val kv__val--mono">
              <Link className="link" href={`/memory/${memory.experienceId}`}>
                {shortId(memory.experienceId)}
              </Link>
            </dd>
          </div>
          <div className="kv__row">
            <dt className="kv__key">Retrieval score</dt>
            <dd className="kv__val kv__val--mono">
              {formatPercent(memory.retrievalScore, 1)}
              {memory.retrievalScore > memory.similarity && (
                <span style={{ color: 'var(--text-3)' }}>
                  {' '}
                  (boosted from {formatPercent(memory.similarity, 1)})
                </span>
              )}
            </dd>
          </div>
          {memory.createdAt && (
            <div className="kv__row">
              <dt className="kv__key">Recorded</dt>
              <dd className="kv__val kv__val--mono">{formatRelative(memory.createdAt)}</dd>
            </div>
          )}
          {memory.lesson && (
            <div className="kv__row">
              <dt className="kv__key">Lesson</dt>
              <dd className="kv__val">{memory.lesson}</dd>
            </div>
          )}
        </dl>
      </div>
    </details>
  );
}
