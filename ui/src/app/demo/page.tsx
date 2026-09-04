import Link from 'next/link';
import { Band, PageHead, Panel } from '@/components/Primitives';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = { title: 'Demo' };

/**
 * DEMO — the two-run reference demonstration (architecture.md §15).
 *
 * This page documents the demo path. The demo is a real test against the
 * live stack (sidecar + API + Base Sepolia market), run twice:
 *   1. fresh agent session, no relevant memory, takes the trade, loses
 *   2. new process, pays x402 to retrieve, decision changes (vetoed)
 *
 * The numbers and txHashes that prove the demo ran are written into the
 * agent's memory and surface in Memories and Activity. This page is the
 * description of what those rows should look like.
 */
export default function DemoPage() {
  return (
    <div className="page">
      <PageHead
        eyebrow="Demo"
        title="The two-run reference demonstration"
        sub="The acceptance test for the product: the agent met the same situation twice and behaved differently the second time because CEPID remembered."
      />

      <Band title="What you are about to see" tight>
        <Panel>
          <ol className="reasons">
            <li className="reasons__item">
              <span className="reasons__index mono">01</span>
              <span>
                <strong>Run 1</strong> — a fresh agent session encounters a market
                for the first time. No relevant memory exists. The base
                strategy says <span className="mono">LONG</span>. The agent takes
                the trade on Base Sepolia with real testnet USDC.
              </span>
            </li>
            <li className="reasons__item">
              <span className="reasons__index mono">02</span>
              <span>
                The market resolves against the trade. CEPID records the outcome
                with the on-chain txHash as evidence. The experience becomes a
                memory.
              </span>
            </li>
            <li className="reasons__item">
              <span className="reasons__index mono">03</span>
              <span>
                After several similar losses, a pattern forms. With repeated
                losses on the same conditions, a scar is created.
              </span>
            </li>
            <li className="reasons__item">
              <span className="reasons__index mono">04</span>
              <span>
                <strong>Run 2</strong> — a new process, same kind of situation.
                The agent pays $0.01 USDC (x402) to retrieve. CEPID returns the
                prior losses, the pattern, and the scar.
              </span>
            </li>
            <li className="reasons__item">
              <span className="reasons__index mono">05</span>
              <span>
                Final confidence drops below the 50% threshold. The decision
                becomes <span className="mono">NO_TRADE</span> — and the decision
                row references the retrieval row that produced it.
              </span>
            </li>
            <li className="reasons__item">
              <span className="reasons__index mono">06</span>
              <span>
                The outcome of run 2 is recorded. Memories that helped are
                reinforced; the scar decays at a quarter of the ordinary rate.
                Counts are visible in <Link className="link" href="/memories">Memories</Link>.
              </span>
            </li>
          </ol>
        </Panel>
      </Band>

      <Band title="What this proves" tight>
        <Panel tone="thin">
          <p className="prose">
            Nothing in the demo is asserted. The decision row carries a
            <span className="mono"> retrievalId</span> that points at a real
            retrieval row; the retrieval row carries the memories it
            returned; the outcome row carries the memories the decision
            actually used (filtered by the platform's
            <span className="mono"> INFLUENCE_NOT_SUPPORTED</span> rule). The
            influence edge is derivable from the data, not narrated.
          </p>
        </Panel>
      </Band>

      <Band title="Where to look" tight>
        <Panel>
          <ul className="reasons">
            <li className="reasons__item">
              <span className="reasons__index mono">·</span>
              <span><Link className="link" href="/memories">Memories</Link> — every experience the agent has recorded, with the influence edge surfaced in detail.</span>
            </li>
            <li className="reasons__item">
              <span className="reasons__index mono">·</span>
              <span><Link className="link" href="/activity">Activity</Link> — the journal of retrievals, decisions, outcomes, and settled payments in the order they happened.</span>
            </li>
            <li className="reasons__item">
              <span className="reasons__index mono">·</span>
              <span><Link className="link" href="/agents">Agents</Link> — the registry, including a second isolated agent that has never seen any of the above.</span>
            </li>
          </ul>
        </Panel>
      </Band>
    </div>
  );
}
