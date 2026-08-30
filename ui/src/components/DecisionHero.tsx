import type { Direction } from '@/lib/types';
import { directionLabel } from '@/lib/format';

export function DecisionHero({
  direction,
  baseConfidence,
  memoryInfluence,
  finalConfidence,
  collateralUsdc,
  marketLabel,
}: {
  direction: Direction;
  baseConfidence: number;
  memoryInfluence: number;
  finalConfidence: number;
  collateralUsdc: number | null;
  marketLabel: string;
}) {
  const influenceSign = memoryInfluence > 0.005 ? 'pos' : memoryInfluence < -0.005 ? 'neg' : 'neutral';
  // Map influence in [-1, 1] to a bar position from 0 to 100%
  const center = 50;
  const width = Math.min(50, Math.abs(memoryInfluence) * 50);
  const left = influenceSign === 'neg' ? center - width : center;

  return (
    <div className="decision-hero">
      <h1 className="decision-hero__action" data-direction={direction}>
        {directionLabel(direction)}
      </h1>
      <p className="page__sub" style={{ margin: 0 }}>{marketLabel}</p>

      <dl className="decision-hero__sub">
        <div>
          <dt>Base confidence</dt>
          <dd>{(baseConfidence * 100).toFixed(0)}%</dd>
        </div>
        <div>
          <dt>Memory influence</dt>
          <dd>
            {memoryInfluence > 0 ? '+' : ''}
            {(memoryInfluence * 100).toFixed(0)}%
          </dd>
        </div>
        <div>
          <dt>Final confidence</dt>
          <dd>{(finalConfidence * 100).toFixed(0)}%</dd>
        </div>
        {collateralUsdc !== null && (
          <div>
            <dt>Collateral</dt>
            <dd>${collateralUsdc.toFixed(2)} USDC</dd>
          </div>
        )}
      </dl>

      <div className="influence-bar" aria-label="Memory influence">
        <span className="stat__label" style={{ minWidth: 64 }}>Influence</span>
        <div className="influence-bar__track">
          <div className="influence-bar__center" aria-hidden="true" />
          <div
            className="influence-bar__fill"
            data-sign={influenceSign}
            style={{ left: `${left}%`, width: `${width}%` }}
          />
        </div>
        <span className="stat__label" style={{ minWidth: 48, textAlign: 'right' }}>
          {memoryInfluence === 0 ? 'neutral' : memoryInfluence > 0 ? 'supportive' : 'bearish'}
        </span>
      </div>
    </div>
  );
}
