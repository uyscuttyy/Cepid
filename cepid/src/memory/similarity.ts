/**
 * Situation similarity — generic over facets.
 *
 * Two components:
 *  1. Facet similarity: compares shared keys exactly (categorical) or by
 *     normalized distance (numeric). Keys present in only one situation are
 *     ignored — different domains describe the world differently.
 *  2. Text similarity: token overlap (Jaccard) as a weak signal for agents
 *     whose facets are sparse.
 *
 * Domain profiles can override the weights via SimilarityWeights; the trading
 * profile in the demo agent passes its tuned weights. Defaults are neutral.
 */
import type { Situation } from '../core/domain.js';

export interface SimilarityWeights {
  /** Weight of facet agreement relative to text overlap. Default 0.7. */
  facetWeight: number;
  /** Weight of text Jaccard. Default 0.3. */
  textWeight: number;
  /** Per-facet weights, keyed by facet name. Missing keys weigh 1. */
  facetWeights?: Record<string, number>;
}

export const DEFAULT_SIMILARITY_WEIGHTS: SimilarityWeights = {
  facetWeight: 0.7,
  textWeight: 0.3,
};

export function similarity(
  a: Situation,
  b: Situation,
  weights: SimilarityWeights = DEFAULT_SIMILARITY_WEIGHTS,
): number {
  if (a.domain !== b.domain) return 0; // cross-domain situations are never similar
  const facetScore = facetSimilarity(a, b, weights);
  const textScore = textSimilarity(a.text, b.text);
  const score = weights.facetWeight * facetScore + weights.textWeight * textScore;
  return Math.max(0, Math.min(1, score));
}

export function distance(
  a: Situation,
  b: Situation,
  weights?: SimilarityWeights,
): number {
  return 1 - similarity(a, b, weights);
}

function facetSimilarity(
  a: Situation,
  b: Situation,
  weights: SimilarityWeights,
): number {
  const shared = Object.keys(a.facets).filter((k) => k in b.facets);
  if (shared.length === 0) return 0;
  let totalWeight = 0;
  let score = 0;
  for (const key of shared) {
    const w = weights.facetWeights?.[key] ?? 1;
    totalWeight += w;
    const va = a.facets[key]!;
    const vb = b.facets[key]!;
    if (typeof va === 'number' && typeof vb === 'number') {
      // Numeric: 1 at equality, decaying by normalized distance within [0, maxRange].
      const range = Math.max(Math.abs(va), Math.abs(vb), 0.5); // avoid /0
      score += w * (1 - Math.min(1, Math.abs(va - vb) / range));
    } else {
      score += w * (String(va) === String(vb) ? 1 : 0);
    }
  }
  return totalWeight === 0 ? 0 : score / totalWeight;
}

function textSimilarity(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.length === 0 || tb.length === 0) return 0;
  const sa = new Set(ta);
  const sb = new Set(tb);
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'on', 'at', 'is', 'was',
  'were', 'be', 'been', 'it', 'its', 'this', 'that', 'for', 'with', 'as',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t));
}
