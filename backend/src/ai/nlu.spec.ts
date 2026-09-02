/**
 * Member 3 — NLU evaluation (intent / entity / life-event / normalization).
 * Runs the synthetic multilingual dataset and reports accuracy. These are
 * the actual test cases demonstrating classification works.
 */
import { normalizeInput } from './nlu/normalizer';
import { classifyIntent } from './nlu/intent-classifier';
import { classifyLifeEvent } from './nlu/life-event-classifier';
import { extractEntities } from './nlu/entity-extractor';
import { EVAL_DATASET, INJECTION_CASES } from './eval/dataset';
import { scanUserInput } from './guardrails/guardrails';

describe('NLU normalization', () => {
  it('collapses whitespace, case-folds latin, preserves Devanagari + original', () => {
    const n = normalizeInput('  I   Need   A  Scholarship  ');
    expect(n.normalized).toBe('i need a scholarship');
    expect(n.original).toBe('  I   Need   A  Scholarship  ');
    expect(n.language).toBe('en');
  });

  it('detects Marathi vs Hindi vs mixed script honestly', () => {
    expect(normalizeInput('मला शिष्यवृत्ती हवी आहे').language).toBe('mr');
    expect(normalizeInput('मुझे छात्रवृत्ति चाहिए').language).toBe('hi');
    expect(normalizeInput('what is a pension').language).toBe('en');
    expect(normalizeInput('मला scholarship हवी').language).toBe('mr');
    // script known but language ambiguous → honest 'devanagari', not a guess
    expect(normalizeInput('नमस्कार').language).toBe('devanagari');
  });
});

describe('NLU intent classification (synthetic dataset)', () => {
  let passed = 0;
  const failures: string[] = [];

  for (const c of EVAL_DATASET) {
    it(`intent: ${c.id}`, () => {
      const n = normalizeInput(c.input);
      const intent = classifyIntent(n.normalized, n.language);
      const ok = intent.name === c.expectIntent;
      if (ok) passed++;
      else failures.push(`${c.id}: expected ${c.expectIntent}, got ${intent.name} (signals: ${intent.signals.join(',')})`);
      expect(ok).toBe(true);
    });
  }

  it('reports dataset accuracy (structured, not invented)', () => {
    const total = EVAL_DATASET.length;
    // eslint-disable-next-line no-console
    console.log(`[nlu-eval] intent accuracy on synthetic dataset: ${passed}/${total} (${((passed / total) * 100).toFixed(1)}%)`);
    expect(failures.length).toBe(0);
  });
});

describe('NLU life-event classification (synthetic dataset)', () => {
  for (const c of EVAL_DATASET) {
    it(`life-event: ${c.id}`, () => {
      const n = normalizeInput(c.input);
      const le = classifyLifeEvent(n.normalized, n.language);
      expect(le.name).toBe(c.expectLifeEvent);
    });
  }
});

describe('NLU entity extraction (synthetic dataset)', () => {
  for (const c of EVAL_DATASET) {
    it(`entities: ${c.id}`, () => {
      const n = normalizeInput(c.input);
      const entities = extractEntities(n.normalized);
      const types = new Set(entities.map((e) => e.type as string));
      for (const t of c.expectEntityTypes) {
        expect(types.has(t)).toBe(true);
      }
    });
  }

  it('does NOT extract PII-shaped values (phone/email/Aadhaar)', () => {
    const n = normalizeInput('my mobile 9876543210 and email test@example.com aadhaar 123456789012');
    const entities = extractEntities(n.normalized);
    const text = JSON.stringify(entities);
    expect(text).not.toContain('9876543210');
    expect(text).not.toContain('test@example.com');
    expect(text).not.toContain('123456789012');
  });
});

describe('NLU confidence is structured uncertainty (no fake decimals)', () => {
  it('returns HIGH/MEDIUM/LOW/NONE states with real signals', () => {
    const strong = classifyIntent(normalizeInput('I need a college scholarship please').normalized, 'en');
    expect(['HIGH', 'MEDIUM', 'LOW', 'NONE']).toContain(strong.state);
    // one distinct keyword, no competing intent → MEDIUM (never a fake decimal)
    expect(strong.state).toBe('MEDIUM');
    expect(strong.signals.length).toBeGreaterThan(0);

    const multi = classifyIntent(normalizeInput('I lost my birth certificate, I need a duplicate').normalized, 'en');
    expect(multi.state).toBe('HIGH'); // multiple distinct keywords

    const weak = classifyIntent(normalizeInput('I want a benefit').normalized, 'en');
    expect(['HIGH', 'MEDIUM', 'LOW', 'NONE']).toContain(weak.state);

    const none = classifyIntent(normalizeInput('tell me about the moon').normalized, 'en');
    expect(none.state).toBe('NONE');
    expect(none.name).toBe('UNKNOWN');
  });
});

describe('guardrails: prompt injection on dataset', () => {
  for (const c of INJECTION_CASES) {
    it(`refuses: ${c.id}`, () => {
      const scan = scanUserInput(c.input);
      expect(scan.flagged).toBe(true);
      expect(scan.reasons.length).toBeGreaterThan(0);
    });
  }

  it('does NOT flag benign queries (no over-refusal)', () => {
    const benign = ['I need a college scholarship please', 'मला रेशन हवे आहे', 'what is the pension scheme for senior citizens?'];
    for (const b of benign) expect(scanUserInput(b).flagged).toBe(false);
  });
});
