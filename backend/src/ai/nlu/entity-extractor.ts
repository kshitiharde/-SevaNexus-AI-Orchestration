import type { ConfidenceState } from './taxonomy';

/**
 * Structured entity extraction (Member 3, NLU stage 2b).
 *
 * Lexicon + pattern based. By design it does NOT extract sensitive personal
 * data (phone, email, Aadhaar numbers) — PII minimization: only task-relevant
 * entities are surfaced, and nothing PII-shaped ever enters AI payloads or
 * the timeline.
 */

export type EntityType =
  | 'benefit_type'
  | 'education_stage'
  | 'relationship'
  | 'document_type'
  | 'location'
  | 'department'
  | 'application_goal';

export interface ExtractedEntity {
  type: EntityType;
  value: string;
  state: ConfidenceState;
}

interface EntityRule {
  type: EntityType;
  value: string;
  patterns: string[]; // substrings, matched against normalized input
}

const RULES: EntityRule[] = [
  // benefit_type
  { type: 'benefit_type', value: 'scholarship', patterns: ['scholarship', 'stipend', 'छात्रवृत्ति', 'शिष्यवृत्ती', 'छात्रावृत्ति'] },
  { type: 'benefit_type', value: 'certificate', patterns: ['certificate', 'प्रमाणपत्र', 'cert'] },
  { type: 'benefit_type', value: 'ration', patterns: ['ration', 'रेशन'] },
  { type: 'benefit_type', value: 'subsidy', patterns: ['subsidy', 'सब्सिडी'] },
  { type: 'benefit_type', value: 'pension', patterns: ['pension', 'पेंशन', 'पेंशन'] },

  // education_stage
  { type: 'education_stage', value: 'higher', patterns: ['college', 'university', 'graduation', 'कॉलेज', 'विद्यापीठ', 'विश्वविद्यालय', 'महाविद्यालय'] },
  { type: 'education_stage', value: 'school', patterns: ['school', 'secondary', 'shaala', 'शाळा', 'स्कूल'] },
  { type: 'education_stage', value: 'postgraduate', patterns: ['postgraduate', "master's", 'pg course', 'em'] },

  // relationship (non-sensitive: kinship only, never names/identifiers)
  { type: 'relationship', value: 'child', patterns: ['my son', 'my daughter', 'meri beti', 'मुलासाठी', 'मुलाची', 'मुलीसाठी', 'मेरे बच्चे', 'बेटा', 'बेटी', 'मुलाला', 'संतान'] },
  { type: 'relationship', value: 'self', patterns: ['for me', 'my application', 'मला', 'माझा', 'मला हवी', 'मैं', 'मेरा'] },
  { type: 'relationship', value: 'spouse', patterns: ['my wife', 'my husband', 'पत्नी', 'पती', 'बीबी'] },

  // document_type
  { type: 'document_type', value: 'INCOME_CERTIFICATE', patterns: ['income certificate', 'आमदनी प्रमाणपत्र', 'आम्दानी प्रमाणपत्र', 'income proof'] },
  { type: 'document_type', value: 'AADHAAR', patterns: ['aadhaar', 'आधार', 'aadhar'] },
  { type: 'document_type', value: 'ADMISSION_PROOF', patterns: ['admission proof', 'proof of admission', 'प्रवेश पुरावा'] },
  { type: 'document_type', value: 'CASTE_CERTIFICATE', patterns: ['caste certificate', 'जात प्रमाणपत्र'] },
  { type: 'document_type', value: 'RESIDENCE_PROOF', patterns: ['residence proof', 'proof of residence', 'निरवासी', 'वास्तव्य'] },

  // location (state/district names only — addresses are PII and never extracted)
  { type: 'location', value: 'maharashtra', patterns: ['maharashtra', 'महाराष्ट्र', 'mh state'] },
  { type: 'location', value: 'pune', patterns: ['pune', 'पुणे'] },
  { type: 'location', value: 'mumbai', patterns: ['mumbai', 'मुंबई'] },

  // department
  { type: 'department', value: 'higher_education', patterns: ['higher education', 'शिक्षण विभाग'] },

  // application_goal
  { type: 'application_goal', value: 'apply', patterns: ['apply', 'application', 'अर्ज', 'आवेदन', 'करावा'] },
  { type: 'application_goal', value: 'reissue', patterns: ['reissue', 'duplicate', 'पुन्हा', 'नवीन प्रती', 'दोबारा', 'हरवले', 'lost', 'नक़ल', 'नकल', 'खो'] },
  { type: 'application_goal', value: 'renew', patterns: ['renew', 'नूतनीकरण', 'renewal'] },
];

export function extractEntities(normalized: string, max = 10): ExtractedEntity[] {
  const found: ExtractedEntity[] = [];
  const seen = new Set<string>();
  for (const rule of RULES) {
    if (found.length >= max) break;
    for (const p of rule.patterns) {
      if (normalized.includes(p)) {
        const key = `${rule.type}:${rule.value}`;
        if (!seen.has(key)) {
          seen.add(key);
          found.push({ type: rule.type, value: rule.value, state: 'HIGH' });
        }
        break;
      }
    }
  }
  return found;
}
