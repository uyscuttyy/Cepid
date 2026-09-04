import { Metadata } from 'next';
import { Band, PageHead, Panel } from '@/components/Primitives';
import { RegisterForm } from './RegisterForm';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export const metadata: Metadata = { title: 'Developers' };

/**
 * DEVELOPERS — register an agent and make the first call.
 *
 * The form posts to a server proxy which forwards to /v1/agents/register on
 * the live platform. The key is shown ONCE in the form's response and is
 * never stored anywhere — copy it before navigating away.
 */
export default function DevelopersPage() {
  return (
    <div className="page">
      <PageHead
        eyebrow="Developers"
        title="Register an agent"
        sub="Mint a key against the live platform. The key is shown once, in this response, and is never stored anywhere — copy it before you navigate away."
      />

      <Band title="Register" tight>
        <RegisterForm />
      </Band>

      <Band title="Use the SDK" tight>
        <Panel tone="thin">
          <pre style={codeStyle}>{`npm install @cepid/client

import { createCepidClient } from '@cepid/client';

const cepid = createCepidClient({
  baseUrl: process.env.CEPID_API_URL!,
  apiKey: process.env.CEPID_API_KEY!,
});

const { retrievalId, memories } = await cepid.retrieve({
  situation: {
    domain: 'support',
    text: 'user asked for a refund on a free-tier charge',
    facets: { tier: 'free', region: 'eu' },
  },
});

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
        </Panel>
      </Band>
    </div>
  );
}

const codeStyle = {
  background: 'var(--surface)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--r-2)',
  padding: 'var(--s-4)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--fs-small)',
  color: 'var(--text-2)',
  overflowX: 'auto' as const,
  whiteSpace: 'pre' as const,
};
