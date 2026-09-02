/**
 * Multilingual NLU taxonomy (Member 3).
 *
 * Substring lexicons over the NORMALIZED input (NFC, case-folded, whitespace
 * collapsed). Devanagari lexicons cover both Hindi and Marathi spellings —
 * code-switched input is matched because every lexicon is scanned regardless
 * of the detected dominant language.
 *
 * Confidence is a STRUCTURED UNCERTAINTY STATE (HIGH/MEDIUM/LOW/NONE), not a
 * fabricated decimal probability — the classifier reports which signals
 * matched instead of inventing calibrated numbers.
 */

export type Language = 'en' | 'hi' | 'mr' | 'mixed' | 'devanagari' | 'unknown';
export type ConfidenceState = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export interface KeywordSet {
  en: string[];
  hi: string[];
  mr: string[];
}

export const INTENT_TAXONOMY: { name: string; keywords: KeywordSet }[] = [
  {
    name: 'BENEFIT_CLAIM',
    keywords: {
      en: ['scholarship', 'stipend', 'subsidy', 'grant', 'benefit', 'pension', 'ration', 'allowance', 'financial aid', 'fee waiver'],
      hi: ['छात्रवृत्ति', 'छात्रावृत्ति', 'भत्ता', 'सब्सिडी', 'पेंशन', 'लाभ', 'रेशन', 'अनुदान', 'रियायत'],
      mr: ['शिष्यवृत्ती', 'शिक्षणवृत्ती', 'भत्ता', 'लाभ', 'पेंशन', 'रेशन', 'अनुदान', 'रियायत'],
    },
  },
  {
    name: 'CERTIFICATE_REQUEST',
    keywords: {
      en: ['certificate', 'birth certificate', 'reissue', 'duplicate', 'copy of', 'lost', 'damaged', 'cert'],
      hi: ['प्रमाणपत्र', 'जन्म प्रमाणपत्र', 'नक़ल', 'नकल', 'खोया', 'नुकसान', 'दोबारा'],
      mr: ['प्रमाणपत्र', 'जन्म', 'पुन्हा', 'नवीन प्रती', 'हरवले', 'तोडले'],
    },
  },
  {
    name: 'GRIEVANCE',
    keywords: {
      en: ['complaint', 'grievance', 'escalate', 'no response', 'stuck', 'delay'],
      hi: ['शिकायत', 'तक्रार', 'बिचारा'],
      mr: ['तक्रार', 'गुनाय'],
    },
  },
  {
    name: 'SERVICE_INFO',
    keywords: {
      en: ['how to', 'what is', 'details', 'information about', 'eligibility for', 'know about', 'guide me'],
      hi: ['कैसे', 'क्या है', 'जानकारी', 'तफसील', 'तपशिल'],
      mr: ['कसं', 'काय आहे', 'माहिती', 'तपशील', 'जानकारी'],
    },
  },
];

export const UNKNOWN_INTENT = 'UNKNOWN';

/**
 * Canonical life-event taxonomy. Includes the values already used by the
 * Service Registry (education / documentation / welfare) so nothing is
 * duplicated with a different name, plus the architecture list.
 */
export const LIFE_EVENT_TAXONOMY: { name: string; keywords: KeywordSet }[] = [
  {
    name: 'education',
    keywords: {
      en: ['school', 'college', 'university', 'student', 'study', 'studies', 'admission', 'exam', 'degree', 'graduation', 'scholarship'],
      hi: ['स्कूल', 'कॉलेज', 'विश्वविद्यालय', 'छात्र', 'विद्यार्थी', 'प्रवेश', 'परीक्षा', 'शिक्षण', 'पढ़ाई', 'छात्रवृत्ति'],
      mr: ['शाळा', 'कॉलेज', 'विद्यापीठ', 'विद्यार्थी', 'प्रवेश', 'परीक्षा', 'शिक्षण', 'पठण', 'शिष्यवृत्ती'],
    },
  },
  {
    name: 'birth',
    keywords: {
      en: ['birth', 'newborn', 'baby born', 'child born'],
      hi: ['जन्म', 'नवजात', 'सन्तान'],
      mr: ['जन्म', 'जन्मले', 'नवजात'],
    },
  },
  {
    name: 'employment',
    keywords: {
      en: ['job', 'employment', 'salary', 'resigned', 'work permit'],
      hi: ['नौकरी', 'रोज़गार', 'रोजगार', 'वेतन', 'चाकरी'],
      mr: ['नोकरी', 'रोजगार', 'वेतन'],
    },
  },
  {
    name: 'marriage',
    keywords: {
      en: ['marriage', 'wedding', 'married'],
      hi: ['विवाह', 'शादी', 'ब्याह'],
      mr: ['विवाह', 'लग्न'],
    },
  },
  {
    name: 'relocation',
    keywords: {
      en: ['relocation', 'moved to', 'shifted home', 'residence proof'],
      hi: ['स्थानांतरण', 'घर बदला'],
      mr: ['स्थलांतर', 'घर बदल'],
    },
  },
  {
    name: 'business',
    keywords: {
      en: ['business', 'shop', 'license', 'licence', 'startup'],
      hi: ['दुकान', 'व्यापार', 'लाइसेंस', 'परवाना'],
      mr: ['दुकान', 'व्यवसाय', 'परवाना', 'लायसन्स'],
    },
  },
  {
    name: 'agriculture',
    keywords: {
      en: ['farm', 'farming', 'crop', 'farmer'],
      hi: ['खेती', 'किसान', 'फसल', 'जमीन'],
      mr: ['शेती', 'शेतकरी', 'पीक', 'जमिनी'],
    },
  },
  {
    name: 'housing',
    keywords: {
      en: ['house', 'rent', 'housing', 'building'],
      hi: ['मकान', 'किराया', 'घर'],
      mr: ['घर', 'भाडे', 'इमारत'],
    },
  },
  {
    name: 'senior',
    keywords: {
      en: ['senior citizen', 'retirement', 'elderly', 'pension'],
      hi: ['वृद्ध', 'निवृत्ति', 'पेंशन'],
      mr: ['वृद्ध', 'निवृत्ती', 'पेंशन'],
    },
  },
  {
    name: 'bereavement',
    keywords: {
      en: ['death', 'deceased', 'funeral', 'passed away'],
      hi: ['मृत्यु', 'दफ़न'],
      mr: ['मृत्यू'],
    },
  },
  {
    name: 'documentation',
    keywords: {
      en: ['document', 'proof', 'record', 'registration', 'aadhaar'],
      hi: ['दस्तावेज', 'पुर्जा', 'दर्जनामा'],
      mr: ['दस्तऐवज', 'पुर्जा'],
    },
  },
  {
    name: 'welfare',
    keywords: {
      en: ['ration', 'food subsidy', 'welfare', 'scheme', 'subsidy'],
      hi: ['रेशन', 'अनाज', 'कल्याण', 'योजना'],
      mr: ['रेशन', 'धान्य', 'कल्याण', 'योजना'],
    },
  },
  {
    name: 'grievance',
    keywords: {
      en: ['complaint', 'grievance'],
      hi: ['शिकायत', 'तक्रार'],
      mr: ['तक्रार'],
    },
  },
  {
    name: 'disability',
    keywords: {
      en: ['disability', 'disabled', 'impairment'],
      hi: ['अपाहिज', 'असमर्थ'],
      mr: ['अपंग', 'अशक्त'],
    },
  },
];

/** Marathi marker words (disambiguation between hi and mr). */
const MARATHI_MARKERS = [
  'हवी', 'हवे', 'हवं', 'पाहिजे', 'मला', 'तुम्ही', 'तुम्हाला', 'आहे', 'होय', 'नाही',
  'शाळा', 'विद्यार्थी', 'शिष्यवृत्ती', 'विद्यापीठ', 'निवृत्ती', 'लग्न', 'शेती',
  'शेतकरी', 'दस्तऐवज', 'कसं', 'तपशील', 'जन्मले', 'भाडे', 'व्यवसाय', 'अपंग',
  'माझ्या', 'तुझा', 'आपण', 'पुन्हा', 'माहिती', 'आहो',
];

/** Hindi marker words. */
const HINDI_MARKERS = [
  'है', 'चाहिए', 'नहीं', 'क्यों', 'क्यो', 'क्या', 'कैसे', 'स्कूल', 'विश्वविद्यालय',
  'पढ़ाई', 'नौकरी', 'वेतन', 'दस्तावेज', 'लाइसेंस', 'मकान', 'किराया', 'निवृत्ति',
  'शिकायत', 'दोबारा', 'मेरे', 'आपका', 'हम',
];

export { MARATHI_MARKERS, HINDI_MARKERS };
