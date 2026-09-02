import { LIFE_EVENT_TAXONOMY, type ConfidenceState, type Language } from './taxonomy';
import { scoreLexicon } from './intent-classifier';

/**
 * Life-event classification (Member 3, NLU stage 3).
 *
 * Independent of intent: a message can carry a life event without a clear
 * intent, and vice versa. Uses the canonical taxonomy (includes the registry
 * values education/documentation/welfare — no duplicate names).
 * Returns null when nothing matches — never guesses a life event.
 */

export interface LifeEventClassification {
  name: string | null;
  state: ConfidenceState;
  signals: string[];
  candidates: { name: string; score: number }[];
}

export function classifyLifeEvent(normalized: string, _language: Language): LifeEventClassification {
  const scored = LIFE_EVENT_TAXONOMY.map((le) => {
    const { score, hits } = scoreLexicon(normalized, le.keywords);
    return { name: le.name, score, hits };
  }).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const top = scored[0];
  const runnerUp = scored[1]?.score ?? 0;
  const candidates = scored.filter((s) => s.score > 0).slice(0, 3).map((s) => ({ name: s.name, score: s.score }));

  if (top.score <= 0) return { name: null, state: 'NONE', signals: [], candidates };

  const tied = runnerUp === top.score;
  const state: ConfidenceState = tied ? 'LOW' : top.score >= 2 ? 'HIGH' : 'MEDIUM';
  const signals = [...top.hits, ...(tied ? [`ambiguous_with:${scored[1].name}`] : [])];
  return { name: top.name, state, signals, candidates };
}
