import type { AgentState } from '@/lib/view';
import { formatRelative } from '@/lib/format';

/**
 * The agent's current state.
 *
 * The state name, tone, and copy all come from `deriveAgentState`, which reads
 * the most recent event the agent actually wrote. Nothing here animates a
 * process the backend is not performing: only genuinely live states get the
 * slow halo, and it decays to idle once the recorded activity is stale.
 */
export function AgentStatus({
  state,
  showTime = false,
}: {
  state: AgentState;
  showTime?: boolean;
}) {
  return (
    <span className="agent-state" data-tone={state.tone} title={state.detail}>
      <span className="agent-state__dot" aria-hidden="true" />
      <span className="agent-state__label">{state.label}</span>
      {showTime && state.at && (
        <span className="label" style={{ letterSpacing: '0.04em' }}>
          {formatRelative(state.at)}
        </span>
      )}
      <span className="visually-hidden">. {state.detail}</span>
    </span>
  );
}

/**
 * The expanded treatment used on the Agent page: the indicator plus the full
 * explanation of what the state means and when it was recorded.
 */
export function AgentStatusDetail({ state }: { state: AgentState }) {
  return (
    <div className="stack stack--tight">
      <AgentStatus state={state} />
      <p className="prose" style={{ fontSize: 'var(--fs-small)' }}>
        {state.detail}
      </p>
      <span className="label" style={{ letterSpacing: '0.04em' }}>
        {state.at ? `Last recorded ${formatRelative(state.at)}` : 'No activity recorded'}
      </span>
    </div>
  );
}
