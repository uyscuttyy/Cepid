import Link from 'next/link';
import { PageHead, Section, Stamp } from '@/components/Primitives';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata = { title: 'Demo' };

/**
 * DEMO — the two-run reference demonstration, told as a docket of exhibits.
 * Numbered because it is a genuine sequence. Real txHashes and memory ids
 * from the recorded run are quoted as evidence.
 */
export default function DemoPage() {
  return (
    <div>
      <PageHead
        filing="CEPID-005"
        title="The two-run demonstration"
        lede="The acceptance test for the product: the agent met the same situation twice and behaved differently the second time because CEPID remembered."
      />

      <div className="hero__stamps">
        <Stamp verdict="ALLOW" size="hero" />
        <span className="hero__arrow" aria-hidden="true">
          →
        </span>
        <Stamp verdict="DENY" size="hero" />
      </div>

      <Section title="Exhibits">
        <ol className="docket">
          <li className="docket__item">
            <div>
              <p>
                <strong>Run 1.</strong> A fresh agent session encounters a market for the first
                time. No relevant memory exists, so the gate returns ALLOW and the agent buys
                YES — three times, with real testnet USDC on Base Sepolia.
              </p>
              <p className="evidence" style={{ fontSize: 'var(--fs-small)', color: 'var(--ink-3)' }}>
                0x7ac860…0582 · 0x75e567…6fc8e · 0x3ac578…6ea861
              </p>
            </div>
          </li>
          <li className="docket__item">
            <div>
              <p>
                The market resolves against the trade. CEPID records each outcome with the
                on-chain txHash as evidence, and the losing experiences become memories.
              </p>
            </div>
          </li>
          <li className="docket__item">
            <div>
              <p>
                Three settled losses on the same conditions form a pattern, and the pattern
                hardens into a scar — weighted heavily on every future retrieval.
              </p>
            </div>
          </li>
          <li className="docket__item">
            <div>
              <p>
                <strong>Run 2.</strong> A new process meets the same kind of situation. The
                agent pays $0.01 USDC (x402) to retrieve, and CEPID returns its own prior
                losses, the pattern, and the scar.
              </p>
            </div>
          </li>
          <li className="docket__item">
            <div>
              <p>
                The gate returns DENY. The decision becomes <span className="evidence">NO_TRADE</span> —
                no signature, no transaction — and the blocked decision is recorded against
                the retrieval that produced it.
              </p>
            </div>
          </li>
          <li className="docket__item">
            <div>
              <p>
                Nothing here is asserted. The decision row carries a{' '}
                <span className="evidence">retrievalId</span> pointing at a real retrieval row;
                the retrieval row carries the memories it returned; the outcome rows carry the
                txHashes. The influence edge is derivable from the data, not narrated.
              </p>
            </div>
          </li>
        </ol>
      </Section>

      <Section title="Where to inspect it">
        <div className="exhibit-box">
          <p className="prose">
            <Link href="/memories">Memories</Link> — every experience, with an influence
            record showing which later decisions it shaped or stopped.
          </p>
          <p className="prose">
            <Link href="/activity">Activity</Link> — the journal of retrievals, verdicts,
            decisions, and outcomes in the order they happened.
          </p>
          <p className="prose" style={{ marginBottom: 0 }}>
            <Link href="/agents">Agents</Link> — the registry, including a second isolated
            agent that has never seen any of the above.
          </p>
        </div>
      </Section>
    </div>
  );
}
