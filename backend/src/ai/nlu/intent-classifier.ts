import { INTENT_TAXONOMY, UNKNOWN_INTENT, type ConfidenceState, type KeywordSet, type Language } from './taxonomy';

/**
 * Deterministic multilingual intent classifier (Member 3, NLU stage 2).
 *
 * Reusable approach (not hard-coded to one example):
 *  - every intent has an EN + HI + MR keyword lexicon;
 *  - ALL lexicons are scanned (script-agnostic), so code-switched input
 *    like "माझ्या मुलासाठी scholarship पाहिजे" matches both scripts;
 *  - the detected language adds no bias — Devanagari inputs match Devanagari
 *    keywords, Latin inputs match Latin keywords;
 *  - confidence is a structured state (HIGH/MEDIUM/LOW/NONE) with the actual
 *    matched signals — no invented calibrated probabilities.
 */

export interface IntentClassification {
  name: string;
  state: ConfidenceState;
  signals: string[];
  candidates: { name: string; score: number }[];
}

export function scoreLexicon(normalized: string, keywords: KeywordSet): { score: number; hits: string[] } {
  // Dedupe: a word shared between the hi and mr lists must count once.
  // Each distinct keyword hit counts 1 (script-independent — no length
  // weighting, which would bias Devanagari combining characters).
  const hits: string[] = [];
  const seen = new Set<string>();
  for (const k of [...keywords.en, ...keywords.hi, ...keywords.mr]) {
    if (!k || seen.has(k)) continue;
    if (normalized.includes(k)) {
      seen.add(k);
      hits.push(k);
    }
  }
  return { score: hits.length, hits };
}

/**
 * Confidence from the actual signal count (structured uncertainty, no
 * invented probabilities):
 *  - ≥2 distinct keywords, no tie → HIGH
 *  - 1 keyword, no tie            → MEDIUM
 *  - exact tie between intents    → LOW (ambiguous)
 */
function stateFor(score: number, tied: boolean): ConfidenceState {
  if (score <= 0) return 'NONE';
  if (tied) return 'LOW';
  return score >= 2 ? 'HIGH' : 'MEDIUM';
}

/**
 * Tie policy: a goal intent (claiming a benefit / requesting a certificate)
 * beats info-seeking — a user who asks "how/what about <service>" still
 * wants that service. Deterministic and documented, not a learned weight.
 */
const GOAL_ORDER: Record<string, number> = {
  BENEFIT_CLAIM: 0,
  CERTIFICATE_REQUEST: 0,
  GRIEVANCE: 1,
  SERVICE_INFO: 2,
  UNKNOWN: 3,
};

export function classifyIntent(normalized: string, _language: Language): IntentClassification {
  const scored = INTENT_TAXONOMY.map((intent) => {
    const { score, hits } = scoreLexicon(normalized, intent.keywords);
    return { name: intent.name, score, hits };
  }).sort((a, b) => b.score - a.score || (GOAL_ORDER[a.name] ?? 9) - (GOAL_ORDER[b.name] ?? 9) || a.name.localeCompare(b.name));

  const top = scored[0];
  const runnerUp = scored[1]?.score ?? 0;
  const candidates = scored.filter((s) => s.score > 0).slice(0, 3).map((s) => ({ name: s.name, score: s.score }));

  if (top.score <= 0) {
    return { name: UNKNOWN_INTENT, state: 'NONE', signals: [], candidates };
  }

  const tied = runnerUp === top.score;
  const state = stateFor(top.score, tied);
  const signals = [...top.hits, ...(tied ? [`ambiguous_with:${scored[1].name}`] : [])];
  return { name: top.name, state, signals, candidates };
}
