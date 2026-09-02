import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CitizenDocument, Service } from '../../database/entities';
import { EligibilityService } from '../../eligibility/eligibility.service';
import { KnowledgeService, type Citation } from '../rag/knowledge.service';
import { asAiLang, EXPLAIN_TEMPLATES, PROMPT_VERSIONS, renderTemplate, REVIEW_NOTE } from '../prompts';
import { LlmClient } from '../llm/llm-client';
import { AiObservabilityService } from '../ai-observability.service';
import { hashText } from '../rag/embedder';
import { AI_CORPUS_VERSION } from '../../database/seed-ai';

/**
 * Explainability Card (Member 3).
 *
 * Consumes Member 2's DETERMINISTIC eligibility result and explains it in
 * plain language. Hard rule: the engine result is ECHOED, never recomputed —
 * this service has no code path that can change the result.
 *
 * In TEMPLATE_FALLBACK mode the explanation is a versioned deterministic
 * template (multilingual). In LLM mode the template is still the fallback if
 * the provider fails; the LLM may only rephrase, and its output is validated
 * (result tokens may not be flipped).
 */

export interface ExplanationCard {
  eligibility_id: string;
  service_id: string;
  service_name: string;
  result: string; // verbatim echo of the deterministic result
  review_status: string;
  rule_version: number | null;
  policy_source: string | null;
  plain_language_explanation: string;
  rules_matched: { rule_id: string; key: string; text: string }[];
  rules_failed: { rule_id: string; key: string; text: string }[];
  missing_information: string[];
  missing_documents: string[];
  policy_reference: Citation | null;
  ai: { mode: string; provider_status: string; prompt_version: string; model: string; model_version: string };
}

interface RuleRef {
  rule_id: string;
  key: string;
  text: string;
}

@Injectable()
export class ExplainabilityService {
  constructor(
    @InjectRepository(CitizenDocument) private readonly documents: Repository<CitizenDocument>,
    @InjectRepository(Service) private readonly services: Repository<Service>,
    private readonly eligibility: EligibilityService,
    private readonly knowledge: KnowledgeService,
    private readonly llm: LlmClient,
    private readonly observability: AiObservabilityService,
  ) {}

  async explain(citizenId: string, evaluationId: string, language?: string, correlationId?: string): Promise<ExplanationCard> {
    const t0 = Date.now();
    const ev = await this.eligibility.get(citizenId, evaluationId); // owner-enforced (404 otherwise)

    const serviceRow = await this.services.findOne({ where: { id: ev.service_id } });
    const serviceName = serviceRow?.canonical_name ?? 'the selected service';

    const matched = (ev.rules_matched ?? []) as RuleRef[];
    const failed = (ev.rules_failed ?? []) as RuleRef[];
    const missing = (ev.missing_inputs ?? []).filter((m) => m !== '__no_active_rule__');

    // Missing documents: required-by-service minus what the citizen already has.
    const required = serviceRow?.required_documents ?? [];
    const owned = new Set((await this.documents.find({ where: { citizen_id: citizenId } })).map((d) => d.type));
    const missingDocs = required.filter((d) => !owned.has(d));

    // Policy citation: retrieve from the allowlisted corpus for this service.
    const retrieval = await this.knowledge.retrieve(`${serviceName} eligibility rules`, {
      limit: 1,
      service_id: ev.service_id,
    });
    const policyRef = retrieval.citations[0] ?? null;

    const lang = asAiLang(language);
    const template = EXPLAIN_TEMPLATES[lang][ev.result] ?? EXPLAIN_TEMPLATES.en[ev.result];
    let explanation = renderTemplate(template, {
      service: serviceName,
      rule_version: String(ev.rule_version ?? 'unknown'),
      n: String(matched.length),
      rules: matched.map((r) => r.text).join(' ') || 'the published conditions',
      fields: missing.length ? missing.join(', ') : 'the capped value',
      missing: missing.length ? missing.join(', ') : 'the declared inputs',
    });
    if (ev.review_status === 'PENDING_MANUAL_REVIEW') {
      explanation += ' ' + REVIEW_NOTE[lang];
    }

    // Optional LLM rephrase (never used for the decision; validated).
    const llmInfo = this.llm.info();
    if (llmInfo.mode === 'LLM') {
      const rephrased = await this.llm.complete(
        'You rephrase a government eligibility explanation in plain language. ' +
          'You MUST NOT change the decision result, add rules, or state anything not in the text. Output one short paragraph.',
        `Result: ${ev.result}. Service: ${serviceName}. ${explanation}`,
      );
      if (rephrased && !this.resultFlipped(rephrased, ev.result)) {
        explanation = rephrased;
      }
    }

    // Observability: versions + correlation id; input is hashed (never raw).
    this.observability.record({
      correlation_id: correlationId ?? null,
      citizen_id: citizenId,
      request_kind: 'EXPLAIN',
      input_hash: hashText(evaluationId),
      model: llmInfo.model,
      model_version: llmInfo.model_version,
      prompt_version: PROMPT_VERSIONS.explain,
      corpus_version: AI_CORPUS_VERSION,
      retrieval_count: policyRef ? 1 : 0,
      citation_count: policyRef ? 1 : 0,
      latency_ms: Date.now() - t0,
      status: 'OK',
    });

    return {
      eligibility_id: ev.id,
      service_id: ev.service_id,
      service_name: serviceName,
      result: ev.result, // verbatim — the engine is authoritative
      review_status: ev.review_status,
      rule_version: ev.rule_version,
      policy_source: ev.policy_source,
      plain_language_explanation: explanation,
      rules_matched: matched,
      rules_failed: failed,
      missing_information: missing,
      missing_documents: missingDocs,
      policy_reference: policyRef,
      ai: {
        mode: llmInfo.mode,
        provider_status: llmInfo.providerStatus,
        prompt_version: PROMPT_VERSIONS.explain,
        model: llmInfo.model,
        model_version: llmInfo.model_version,
      },
    };
  }

  /** Safety check: the LLM rephrase must not flip the decision result. */
  private resultFlipped(text: string, original: string): boolean {
    const t = text.toLowerCase();
    const flips: Record<string, string[]> = {
      ELIGIBLE: ['not eligible', 'ineligible'],
      NOT_ELIGIBLE: ['you are eligible', 'fully eligible'],
      LIKELY_ELIGIBLE: ['not eligible'],
      INSUFFICIENT_INFORMATION: ['you are eligible', 'not eligible'],
    };
    return (flips[original] ?? []).some((f) => t.includes(f));
  }
}
