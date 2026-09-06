import type { Metadata } from 'next';
import { PageHead, Section } from '@/components/Primitives';
import { RegisterForm } from './RegisterForm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata: Metadata = { title: 'Developers' };

/**
 * DEVELOPERS — register an agent and make the first call.
 */
export default function DevelopersPage() {
  return (
    <div>
      <PageHead
        filing="CEPID-006"
        title="Register an agent"
        lede="Mint a key against the live platform. The key is shown once, in this response, and is never stored anywhere — copy it before you navigate away."
      />

      <Section title="Register">
        <RegisterForm />
      </Section>

      <Section title="Use the SDK" note="npm install @cepid/client">
        <pre className="codeblock">{`import { createCepidClient } from '@cepid/client';

const cepid = createCepidClient({
  baseUrl: process.env.CEPID_API_URL!,
  apiKey: process.env.CEPID_API_KEY!,
});

const { retrievalId, memories, verdict } = await cepid.retrieve({
  situation: {
    domain: 'support',
    text: 'user asked for a refund on a free-tier charge',
    facets: { tier: 'free', region: 'eu' },
  },
});

if (verdict === 'DENY') return; // memory blocks this action — do not trade

const { decision } = await cepid.recordDecision({
  retrievalId,
  memoryIds: memories.map(m => m.id),
  situation: { /* same shape */ },
  action: 'refund',
  confidenceBase: 0.5,
  confidenceFinal: 0.3,
  memoryInfluence: -0.2,
  reasoning: ['retrieved 3 losses on similar refund requests'],
});

await cepid.recordOutcome({
  decisionId: decision.id,
  outcome: { result: 'refund_approved', valence: 'good', metrics: { refund_usdc: 12 } },
});`}</pre>
      </Section>
    </div>
  );
}
