import { createHash } from 'crypto';

/**
 * Local deterministic embedder (Member 3, RAG).
 *
 * Honest labeling: this is a LOCAL, DETERMINISTIC, LEXICAL vectorizer
 * (hashed word + character-trigram features, L2-normalized, cosine-similarity
 * retrieval). It is NOT a neural embedding model and is labeled
 * 'LOCAL_DETERMINISTIC' everywhere it is reported. It exists so the full RAG
 * pipeline (ingest → chunk → embed → store → retrieve → cite) works and is
 * testable without external API access.
 *
 * A real embedding provider can be configured via env
 * (EMBEDDING_PROVIDER=openai|ollama + EMBEDDING_API_KEY); when configured but
 * unreachable the pipeline degrades to this local embedder and reports
 * REQUIRES_API_ACCESS — it never fabricates "real" embeddings.
 */

export const LOCAL_EMBEDDING_PROVIDER = 'local-hash-v1';
export const EMBED_DIM = 1024;

function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const WORD_RE = /[^a-z0-9\u0900-\u097F]+/;

/**
 * Generic-function stopwords (EN + Devanagari). Removing them from the
 * WORD features dramatically reduces false similarity between unrelated
 * government documents that share only common words. Kept conservative:
 * only pure function words — no content words.
 */
const STOPWORDS = new Set<string>(
  [
    // English
    'the', 'and', 'is', 'for', 'a', 'an', 'of', 'in', 'to', 'what', 'how', 'do', 'i', 'you',
    'my', 'we', 'they', 'it', 'that', 'this', 'with', 'from', 'by', 'or', 'not', 'be', 'are',
    'was', 'were', 'your', 'our', 'their', 'can', 'could', 'should', 'may', 'might', 'will',
    'would', 'as', 'at', 'on', 'if', 'then', 'than', 'so', 'such', 'no', 'yes', 'very', 'just',
    'about', 'into', 'over', 'under', 'more', 'most', 'less', 'least', 'other', 'some', 'any',
    'all', 'each', 'few', 'both', 'either', 'neither', 'there', 'here', 'when', 'where', 'why',
    'which', 'who', 'whom', 'has', 'have', 'had', 'been', 'being', 'does', 'did', 'doing',
    // Hindi
    'का', 'की', 'के', 'में', 'से', 'है', 'ही', 'ये', 'यह', 'था', 'थी', 'हैं', 'को', 'पर', 'और',
    // Marathi
    'चा', 'ची', 'चे', 'च्या', 'मध्ये', 'आहे', 'आहो', 'हे', 'त्या', 'तथा', 'आणि', 'पासून', 'कडे',
    'वर', 'खाली', 'आता', 'मग', 'पण', 'किंवा', 'कारण',
  ].filter((s) => s.length >= 2),
);

/** Deterministic embedding of arbitrary text (script-agnostic). */
export function embedLocal(text: string): number[] {
  const vec = new Array<number>(EMBED_DIM).fill(0);
  const normalized = text.toLowerCase().normalize('NFC');

  // Word-level features (weight 2): script-agnostic tokenization, stopwords
  // removed (generic words inflate similarity between unrelated documents).
  const words = normalized.split(WORD_RE).filter((w) => w.length >= 2 && !STOPWORDS.has(w));
  for (const w of words) {
    vec[fnv1a(w) % EMBED_DIM] += 2;
    vec[(fnv1a('w:' + w) >>> 1) % EMBED_DIM] += 1;
  }

  // Character-trigram features (weight 1): computed over the STOPWORD-
  // FILTERED word stream. Sub-word similarity still survives (Devanagari
  // affixes: मर्यादा ≈ मर्यादेत) while generic-word character noise
  // (the/and/about) can no longer inflate similarity between unrelated docs.
  const compact = words.join(' ');
  for (let i = 0; i + 3 <= compact.length; i++) {
    vec[fnv1a(compact.slice(i, i + 3)) % EMBED_DIM] += 1;
  }

  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  // Both vectors are L2-normalized at creation; guard against non-normalized input.
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  na = Math.sqrt(na) || 1;
  nb = Math.sqrt(nb) || 1;
  return dot / (na * nb);
}

/** sha256 hex — used for cache keys and observability input hashes (never raw). */
export function hashText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
