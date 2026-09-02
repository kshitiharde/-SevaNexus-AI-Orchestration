/**
 * Guardrails (Member 3, AI safety).
 *
 * 1. Prompt-injection defense on USER input (EN + Devanagari patterns).
 * 2. RAG-poisoning defense on RETRIEVED content — retrieved text is DATA,
 *    never instructions; flagged chunks are quarantined and excluded.
 * 3. PII minimization — phone/email/Aadhaar-shaped values are redacted from
 *    anything that leaves the AI boundary (LLM payloads, observability).
 * 4. Response validation — no system-prompt fragments, no invented
 *    eligibility assertions.
 */

export interface ScanResult {
  flagged: boolean;
  reasons: string[];
}

const INJECTION_PATTERNS: { re: RegExp; id: string }[] = [
  { re: /\bignore\s+(all\s+|any\s+|the\s+)?(previous|prior|above|earlier|system)\s+(instructions|prompts|rules|context|messages)/i, id: 'ignore_previous' },
  { re: /\bdisregard\s+(all\s+|any\s+)?(previous|prior|above|system)\s+(instructions|prompts|rules)/i, id: 'disregard_previous' },
  { re: /\bforget\s+(your|all|the|previous)\s+(instructions|rules|training|prompt)/i, id: 'forget_instructions' },
  { re: /\btell\s+(me|us)\s+(that\s+)?(i\s+(am|'?m)|you\s+are)?\s*eligible\b/i, id: 'assert_eligibility' },
  { re: /\boverride\s+(the\s+|all\s+)?(rules|eligibility|system|policies|validation)/i, id: 'override_rules' },
  { re: /\bpretend\s+(the|that|you)\s+(government|api|portal|system|server|submission|verification)/i, id: 'pretend_api' },
  { re: /\b(reveal|show|print|output|repeat)\s+(your|the)\s+(system\s+)?prompt/i, id: 'reveal_prompt' },
  { re: /\bwhat\s+is\s+your\s+(system\s+)?prompt\b/i, id: 'ask_prompt' },
  { re: /\bact\s+as\s+(if\s+you\s+are|the)\s+(a\s+)?(different|new|other)\s+(model|assistant|ai)\b/i, id: 'role_hijack' },
  { re: /\bbypass\s+(the\s+|all\s+)?(consent|authorization|permission|check)/i, id: 'bypass_consent' },
  // Devanagari (Marathi + Hindi) injection patterns
  { re: /निर्देशन(ा?)?\s*(अनदेखा|भिळवा|उलभाळा|पेछाड)/, id: 'mr_ignore_instructions' },
  { re: /पूर्ववरील\s*(निर्देशन|नियम|सूचना)/, id: 'mr_previous_instructions' },
  { re: /पिछले\s*(निर्देशन|नियम|सूचना).*अनदेखा/, id: 'hi_ignore_instructions' },
  { re: /मला\s*सांगा\s*की\s*मी\s*(पात्र|योग्य)/, id: 'mr_assert_eligibility' },
  { re: /मुझे\s*बताओ\s*कि\s*मैं\s*(पात्र|योग्य)/, id: 'hi_assert_eligibility' },
  { re: /नियम(े)?\s*(बदला|ओवरराइड|पेछाड|अनदेखा)/, id: 'mr_override_rules' },
  { re: /गुप्त\s*(प्रॉम्प्ट|सूचना|पॉलिसी)/, id: 'mr_secret_prompt' },
  { re: /सरकारी\s*(एपीआय|api|पोर्टल|प्रणाली).*(यशस्वी|succeeded|सफल)/i, id: 'mr_pretend_api' },
];

export const POISON_PATTERNS: { re: RegExp; id: string }[] = [
  { re: /\bignore\s+(all\s+|any\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i, id: 'poison_ignore' },
  { re: /\bdisregard\s+(all\s+|any\s+)?(instructions|prompts|rules)/i, id: 'poison_disregard' },
  { re: /\b(reveal|output|show)\s+(your|the)\s+(system\s+)?prompt/i, id: 'poison_prompt' },
  { re: /\byou\s+(must|should)\s+tell\s+(the\s+)?user/i, id: 'poison_instruct' },
  { re: /\bnew\s+instructions?\s*:/i, id: 'poison_new_instructions' },
  { re: /निर्देशन(ा?)?\s*अनदेखा/, id: 'poison_mr_ignore' },
  { re: /तुम्हाला\s*(तत्काळ|काहीही)\s*सांगावे/, id: 'poison_mr_instruct' },
];

function scanPatterns(text: string, patterns: { re: RegExp; id: string }[]): ScanResult {
  const reasons: string[] = [];
  for (const p of patterns) {
    if (p.re.test(text)) reasons.push(p.id);
  }
  return { flagged: reasons.length > 0, reasons };
}

/** User-input injection scan (before any NLU step). */
export function scanUserInput(input: string): ScanResult {
  return scanPatterns(input, INJECTION_PATTERNS);
}

/** Retrieved-content poisoning scan (retrieved text is data, not authority). */
export function scanRetrievedContent(text: string): ScanResult {
  return scanPatterns(text, POISON_PATTERNS);
}

/**
 * PII redaction for anything leaving the AI boundary (LLM payloads,
 * observability, timeline summaries). Replaces — never logs — the values.
 */
export function redactPii(text: string): string {
  return text
    .replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi, '[REDACTED_EMAIL]')
    .replace(/(?<!\d)(\+?91[\s-]?)?[6-9]\d[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g, '[REDACTED_PHONE]')
    .replace(/(?<!\d)\d{4}[\s-]?\d{4}[\s-]?\d{4}(?!\d)/g, '[REDACTED_ID_NUMBER]')
    .replace(/(?<!\d)\d{12}(?!\d)/g, '[REDACTED_ID_NUMBER]');
}

export function containsPii(text: string): boolean {
  return redactPii(text) !== text;
}

/**
 * Final response validation: nothing that must never leave the boundary may
 * appear in outbound strings. `secretFragments` are actual prompt-template
 * snippets that must never be echoed.
 */
export function validateOutbound(text: string, secretFragments: string[]): string[] {
  const problems: string[] = [];
  for (const f of secretFragments) {
    if (f.length >= 8 && text.includes(f)) problems.push('secret_leak');
  }
  if (containsPii(text)) problems.push('pii_in_response');
  return problems;
}
