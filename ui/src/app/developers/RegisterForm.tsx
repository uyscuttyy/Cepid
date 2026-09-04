'use client';

import { useState } from 'react';
import { Chip, Notice, Panel } from '@/components/Primitives';

interface Issued {
  agentId: string;
  apiKey: string;
  keyPrefix: string;
  keyLast4: string;
}

/**
 * The interactive part of the Developers page.
 *
 * Server page renders the chrome; this client component handles the form
 * state and the once-only key reveal. The key is shown to the user and
 * stored only in component state — refreshing the page wipes it.
 */
export function RegisterForm() {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [issued, setIssued] = useState<Issued | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.message ?? body.error ?? `HTTP ${res.status}`);
        return;
      }
      setIssued({
        agentId: body.agent.id,
        apiKey: body.apiKey,
        keyPrefix: body.keyPrefix,
        keyLast4: body.keyLast4,
      });
      setName('');
      setDescription('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (issued) {
    return (
      <Panel>
        <div className="stack">
          <div>
            <Chip tone="pos">registered</Chip>{' '}
            <span className="mono" style={{ marginLeft: 'var(--s-3)' }}>{issued.agentId}</span>
          </div>
          <div>
            <span className="label">API key</span>
            <pre style={keyBoxStyle}>{issued.apiKey}</pre>
            <p className="prose" style={{ fontSize: 'var(--fs-small)' }}>
              Prefix <span className="mono">{issued.keyPrefix}</span> · last 4{' '}
              <span className="mono">{issued.keyLast4}</span> ·{' '}
              <strong>shown once</strong>. Store it now.
            </p>
          </div>
          <Notice title="Next: use it" tone="blue">
            Set <code>CEPID_API_KEY={issued.apiKey}</code> in your agent's
            environment, install <code>@cepid/client</code>, and call{' '}
            <code>cepid.retrieve(&#123; situation &#125;)</code> against{' '}
            <code>CEPID_API_URL</code>. The first retrieval will be paid
            via x402 at the configured price.
          </Notice>
        </div>
      </Panel>
    );
  }

  return (
    <form onSubmit={submit}>
      <Panel>
        <div className="stack">
          <label style={labelStyle}>
            <span className="label">Name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={1}
              maxLength={128}
              placeholder="e.g. Support Triage Bot"
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            <span className="label">Description (optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={512}
              rows={3}
              placeholder="What the agent does — appears on its registry row."
              style={{ ...inputStyle, fontFamily: 'var(--font-sans)' }}
            />
          </label>
          {error && <Notice title="Could not register" tone="neg">{error}</Notice>}
          <div>
            <button type="submit" disabled={submitting || name.trim().length === 0} style={btnStyle}>
              {submitting ? 'Registering…' : 'Register agent'}
            </button>
          </div>
        </div>
      </Panel>
    </form>
  );
}

const labelStyle: React.CSSProperties = { display: 'grid', gap: 'var(--s-2)' };

const inputStyle: React.CSSProperties = {
  background: 'var(--surface-2)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--r-2)',
  padding: 'var(--s-3) var(--s-4)',
  color: 'var(--text)',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--fs-body)',
  width: '100%',
};

const btnStyle: React.CSSProperties = {
  background: 'var(--blue)',
  color: 'var(--blue-ink)',
  padding: 'var(--s-3) var(--s-5)',
  borderRadius: 'var(--r-2)',
  fontWeight: 500,
  fontSize: 'var(--fs-body)',
};

const keyBoxStyle: React.CSSProperties = {
  background: 'var(--surface)',
  border: '1px solid var(--line-strong)',
  borderRadius: 'var(--r-2)',
  padding: 'var(--s-4)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--fs-body)',
  color: 'var(--blue)',
  overflowX: 'auto',
  margin: 'var(--s-3) 0',
};
