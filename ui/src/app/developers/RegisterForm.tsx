'use client';

import { useState } from 'react';
import { Notice } from '@/components/Primitives';

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
      <div>
        <p className="prose">
          Registered as <span className="evidence">{issued.agentId}</span>.
        </p>
        <p className="prose">Your key — shown once, never stored. Copy it now.</p>
        <pre className="codeblock" style={{ background: 'var(--deny)', margin: '16px 0' }}>
          {issued.apiKey}
        </pre>
        <p className="prose" style={{ fontSize: 'var(--fs-small)' }}>
          Prefix <span className="evidence">{issued.keyPrefix}</span> · last 4{' '}
          <span className="evidence">{issued.keyLast4}</span>
        </p>
        <Notice title="Next: use it" tone="allow">
          Set <code>CEPID_API_KEY={issued.apiKey}</code> in your agent's environment,
          install <code>@cepid/client</code>, and call{' '}
          <code>cepid.retrieve(&#123; situation &#125;)</code> against{' '}
          <code>CEPID_API_URL</code>. The first retrieval will be paid via x402 at the
          configured price.
        </Notice>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="form">
      <label className="form__field">
        <span className="form__label">Name</span>
        <input
          className="form__input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          minLength={1}
          maxLength={128}
          placeholder="e.g. Support Triage Bot"
        />
      </label>
      <label className="form__field">
        <span className="form__label">Description (optional)</span>
        <textarea
          className="form__input"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={512}
          rows={3}
          placeholder="What the agent does — appears on its registry row."
        />
      </label>
      {error && (
        <Notice title="Could not register" tone="deny">
          {error}
        </Notice>
      )}
      <div>
        <button className="form__submit" type="submit" disabled={submitting || name.trim().length === 0}>
          {submitting ? 'Registering…' : 'Register agent'}
        </button>
      </div>
    </form>
  );
}
