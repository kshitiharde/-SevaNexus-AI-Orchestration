/**
 * Versioned prompt & template registry (Member 3).
 *
 * All templates live here — no large prompts scattered through services.
 * Versions are recorded in the AI response + ai_event observability rows
 * (Member 5 governance contract).
 */

export const PROMPT_VERSIONS = {
  explain: 'v1.0.0',
  refusal: 'v1.0.0',
  rag_refusal: 'v1.0.0',
  guard: 'v1.0.0',
} as const;

export type AiLang = 'en' | 'hi' | 'mr';

export function asAiLang(lang: string | null | undefined): AiLang {
  if (lang === 'hi' || lang === 'mr') return lang;
  return 'en';
}

/** Safe refusal when the input is flagged as a prompt injection. */
export const REFUSAL_MESSAGES: Record<AiLang, string> = {
  en: 'For safety, I cannot process that request. I can only help with SevaNexus services and use the official, deterministic rules — I cannot override eligibility rules or reveal internal instructions.',
  hi: 'सुरक्षा के लिए मैं वह अनुरोध संसाधित नहीं कर सकता। मैं केवल SevaNexus सेवाओं में मदद कर सकता हूँ और आधिकारिक, निर्धारित नियमों का उपयोग करता हूँ — मैं पात्रता नियमों को बदल या अंदरूनी निर्देश दिखा नहीं सकता।',
  mr: 'सुरक्षेसाठी मी तो विनंती सादर करू शकत नाही. मी फक्त SevaNexus सेवांमध्ये मदत करू शकतो आणि अधिकृत, निश्चित नियम वापरतो — मी पात्रता नियम बदलू शकत नाही किंवा अंतर्गत सूचना दाखवू शकत नाही.',
};

/** Retrieval-unavailable fallback: never answer government questions from memory. */
export const RAG_REFUSAL: Record<AiLang, string> = {
  en: 'I cannot verify this from the approved knowledge sources available in this environment. Please verify from the official source or the department office.',
  hi: 'मैं इसकी पुष्टि उपलब्ध अनुमोदित ज्ञान स्रोतों से नहीं कर सकता। कृपया आधिकारिक स्रोत या विभाग कार्यालय से सत्यापन करें।',
  mr: 'मी उपलब्ध परवानगी दिलेली ज्ञान स्रोतांवरून हे तपासू शकत नाही. कृपया अधिकृत स्रोतांकडून किंवा विभागाच्या कार्यालयातून पडताळणी करा.',
};

export const STALE_NOTE: Record<AiLang, string> = {
  en: 'Some of the sources cited for this answer may be outdated — verify at the source before acting.',
  hi: 'इस उत्तर के लिए उद्धृत कुछ स्रोत पुराने हो सकते हैं — कार्रवाई से पहले स्रोत से सत्यापित करें।',
  mr: 'या उत्तरासाठी उल्लेखिलेल्या काही स्रोतांची कालावधी पूर्ण झाली असू शकते — कारवाई करण्यापूर्वी स्रोताकडून पडताळा.',
};

export interface ExplainContext {
  service_name: string;
  rule_count_matched: number;
  rule_texts_matched: string[];
  rule_texts_failed: string[];
  missing_fields: string[];
  missing_documents: string[];
  has_conflict: boolean;
}

/**
 * Plain-language explanation templates, keyed by deterministic eligibility
 * result. The engine result is GIVEN (echoed, never recomputed) — the
 * template only explains it.
 */
export const EXPLAIN_TEMPLATES: Record<AiLang, Record<string, string>> = {
  en: {
    ELIGIBLE:
      'Based on the official deterministic rules (version {rule_version}), you meet the requirements for {service}. All {n} conditions were satisfied: {rules}. This result was decided by the rules engine, not by an AI.',
    NOT_ELIGIBLE:
      'Based on the official deterministic rules (version {rule_version}), you do not currently meet the requirements for {service}. Conditions not met: {rules}. You can verify with the department office.',
    LIKELY_ELIGIBLE:
      'You appear to meet the conditions for {service}, but {fields} could not be confirmed with verified documents yet. The rules engine therefore reports a likely-eligible result, not a final one.',
    INSUFFICIENT_INFORMATION:
      'I cannot determine eligibility yet because this information is still missing: {missing}. Please provide the missing details and the check will be re-run deterministically.',
  },
  hi: {
    ELIGIBLE:
      'आधिकारिक निर्धारित नियमों (संस्करण {rule_version}) के अनुसार, आप {service} के लिए पात्र हैं। सभी {n} शर्तें पूरी हुईं: {rules}। यह निष्कर्ष नियम इंजन द्वारा निर्धारित है, AI द्वारा नहीं।',
    NOT_ELIGIBLE:
      'आधिकारिक निर्धारित नियमों (संस्करण {rule_version}) के अनुसार, आप वर्तमान में {service} के लिए पात्र नहीं हैं। पूरी नहीं हुई शर्तें: {rules}। आप विभाग कार्यालय से सत्यापन कर सकते हैं।',
    LIKELY_ELIGIBLE:
      'आप {service} की शर्तों को पूरा करते दिखते हैं, लेकिन {fields} की सत्यापित दस्तावेज़ात्मक पुष्टि अभी बाकी है। इसलिए नियम इंजन संभावित पात्रता दर्शाता है, अंतिम निर्णय नहीं।',
    INSUFFICIENT_INFORMATION:
      'पात्रता तय करने के लिए यह जानकारी अभी बाकी है: {missing}। कृपया आवश्यक जानकारी दें; जाँच फिर से नियम इंजन द्वारा की जाएगी।',
  },
  mr: {
    ELIGIBLE:
      'अधिकृत निश्चित नियमांनुसार (संस्करण {rule_version}), तुम्ही {service} पात्र आहात. {n} अटी पूर्ण झाल्या: {rules}. ही निष्कर्ष नियम इंजिनने ठरवला आहे, AI ने नाही.',
    NOT_ELIGIBLE:
      'अधिकृत निश्चित नियमांनुसार (संस्करण {rule_version}), सध्या तुम्ही {service} पात्र नसल्याचे दिसते. पूर्ण न झालेल्या अटी: {rules}. तुम्ही विभागाच्या कार्यालयाकडून पडताळणी करू शकता.',
    LIKELY_ELIGIBLE:
      'तुम्ही {service} च्या अटी पूर्ण करत असल्यासारखे दिसता, पण {fields} ची पडताळलेली दस्तऐवज-पुष्टी आताही बाकी आहे. त्यामुळे नियम इंजिन “संभाव्य पात्रता” दर्शवत आहे, अंतिम निर्णय नाही.',
    INSUFFICIENT_INFORMATION:
      'पात्रता ठरवण्यासाठी ही माहिती आताही बाकी आहे: {missing}. कृपया आवश्यक माहिती द्या; तपासणी पुन्हा नियम इंजिनद्वारे होईल.',
  },
};

export const REVIEW_NOTE: Record<AiLang, string> = {
  en: 'Additionally, more than one active rule version has different conditions, so this case has been registered for manual review. No automatic decision has been made.',
  hi: 'साथ ही, एक से अधिक सक्रिय नियम संस्करणों की शर्तें अलग हैं, इसलिए इस मामले को मैन्युअल समीक्षा के लिए दर्ज किया गया है। कोई स्वतः निर्णय नहीं लिया गया है।',
  mr: 'तिचेसह, एकाहून अधिक सक्रिय नियम संस्करणांच्या अटी वेगळ्या आहेत, त्यामुळे हा प्रकर मॅन्युअल पडताळणीसाठी नोंदवला गेला आहे. कोणताही आपोआप निर्णय घेला गेलेला नाही.',
};

export function renderTemplate(template: string, vars: Record<string, string>): string {
  let out = template;
  for (const [k, v] of Object.entries(vars)) out = out.split(`{${k}}`).join(v);
  return out;
}
