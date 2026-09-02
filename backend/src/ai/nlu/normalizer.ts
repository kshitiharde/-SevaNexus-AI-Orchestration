import { HINDI_MARKERS, MARATHI_MARKERS, type Language } from './taxonomy';

/**
 * Input normalization (Member 3, NLU stage 1).
 *
 * - Unicode NFC + trim + whitespace collapse + case folding (Latin).
 * - Devanagari is preserved as-is (case folding is a no-op for it) — the
 *   original language/context is never destroyed.
 * - The ORIGINAL input is always kept alongside the normalized one.
 * - Language detection is heuristic and honest: it may return 'devanagari'
 *   (script known, language ambiguous) rather than guessing.
 */

export interface Normalization {
  original: string;
  normalized: string;
  language: Language;
  script: 'latin' | 'devanagari' | 'mixed' | 'none';
}

const DEVANAGARI_RE = /[\u0900-\u097F]/g;
const LATIN_RE = /[a-z]/g;

/**
 * Documented spelling-variant map (applied AFTER case-folding, before
 * matching). Kept deliberately tiny and explicit — no fuzzy "normalization"
 * that could destroy meaning. Both real spellings are recognized in the wild;
 * the registry/lexicons use the canonical form.
 */
const VARIANTS: Record<string, string> = {
  'राशन': 'रेशन', // Marathi variant of रेशन (ration)
};

export interface LanguageDetection {
  language: Language;
  script: Normalization['script'];
  marathiHits: number;
  hindiHits: number;
}

export function detectLanguage(text: string): LanguageDetection {
  const devanagari = (text.match(DEVANAGARI_RE) ?? []).length;
  const latin = (text.match(LATIN_RE) ?? []).length;

  let script: Normalization['script'] = 'none';
  if (devanagari > 0 && latin > 0) script = 'mixed';
  else if (devanagari > 0) script = 'devanagari';
  else if (latin > 0) script = 'latin';

  if (script === 'latin') return { language: 'en', script, marathiHits: 0, hindiHits: 0 };
  if (script === 'none') return { language: 'unknown', script, marathiHits: 0, hindiHits: 0 };

  let marathiHits = 0;
  let hindiHits = 0;
  for (const m of MARATHI_MARKERS) if (text.includes(m)) marathiHits++;
  for (const m of HINDI_MARKERS) if (text.includes(m)) hindiHits++;

  if (marathiHits > 0 && hindiHits > 0) return { language: 'mixed', script, marathiHits, hindiHits };
  if (marathiHits > 0) return { language: 'mr', script, marathiHits, hindiHits: 0 };
  if (hindiHits > 0) return { language: 'hi', script, marathiHits: 0, hindiHits };
  return { language: 'devanagari', script, marathiHits: 0, hindiHits: 0 };
}

export function normalizeInput(raw: string): Normalization {
  const original = raw;
  let normalized = raw
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  for (const [variant, canonical] of Object.entries(VARIANTS)) {
    if (normalized.includes(variant)) normalized = normalized.split(variant).join(canonical);
  }
  const det = detectLanguage(normalized);
  return { original, normalized, language: det.language, script: det.script };
}
