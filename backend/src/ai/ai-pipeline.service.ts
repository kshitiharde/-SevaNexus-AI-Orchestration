import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';
import { Application, CitizenDocument, Journey, Service } from '../database/entities';
import { ServicesService } from '../services/services.service';
import { JourneysService } from '../journeys/journeys.service';
import { JourneyEventsService } from '../journeys/journey-events.service';
import { EligibilityService } from '../eligibility/eligibility.service';
import { AuditService } from '../audit/audit.service';
import { normalizeInput } from './nlu/normalizer';
import { classifyIntent, type IntentClassification } from './nlu/intent-classifier';
import { classifyLifeEvent, type LifeEventClassification } from './nlu/life-event-classifier';
import { extractEntities, type ExtractedEntity } from './nlu/entity-extractor';
import { UNKNOWN_INTENT } from './nlu/taxonomy';
import { KnowledgeService, type Citation } from './rag/knowledge.service';
import { ServiceGraphService } from './graph/service-graph.service';
import { ExplainabilityService, type ExplanationCard } from './explain/explainability.service';
import { NextBestActionService, type NextAction } from './nba/next-best-action.service';
import { TimelineBuilder, type TimelineEventOut } from './timeline/timeline-builder';
import { LlmClient } from './llm/llm-client';
import { AiCacheService } from './ai-cache.service';
import { AiObservabilityService } from './ai-observability.service';
import { hashText } from './rag/embedder';
import { REFUSAL_MESSAGES, RAG_REFUSAL, STALE_NOTE, asAiLang, PROMPT_VERSIONS } from './prompts';
import { scanUserInput, validateOutbound } from './guardrails/guardrails';
import { AI_CORPUS_VERSION } from '../database/seed-ai';

/**
 * AI pipeline orchestrator (Member 3) — the core architecture flow:
 *
 *   User Input → Normalization → Intent + Entity Extraction →
 *   Life-Event Classification → Context Builder → Service Graph Retrieval →
 *   Official Knowledge Retrieval (RAG) → Deterministic Eligibility (Member 2) →
 *   Guardrails / Policy Check → Explanation (templates; LLM optional) →
 *   structured response (user confirmation happens in the UI) → Workflow
 *
 * The LLM (if ever configured) can only rephrase EXPLANATIONS. It never
 * decides eligibility, service selection, consent, or any structured field.
 * All "AI" here is deterministic by default (TEMPLATE_FALLBACK) and labeled.
 */

export interface AskInput {
  message: string;
  journey_id?: string;
  language?: string;
  /** Optional attributes for an inline deterministic eligibility check. */
  attributes?: Record<string, unknown>;
  verified_fields?: string[];
  /** Conversation context (data-minimized: max 3 relevant turns). */
  context?: { goal?: string; relevant_turns?: string[] };
}

export interface AiUnderstanding {
  original_input: string;
  normalized_input: string;
  detected_language: string;
  intent: { name: string; confidence: { state: string; signals: string[] } };
  life_event: { name: string | null; confidence: { state: string; signals: string[] } };
  entities: { type: string; value: string; confidence: { state: string } }[];
  context_used: { turns: number; profile_fields: string[] };
}

@Injectable()
export class AiPipelineService {
  private readonly logger = new Logger('AiPipeline');

  constructor(
    @InjectRepository(Service) private readonly serviceRepo: Repository<Service>,
    @InjectRepository(Application) private readonly applications: Repository<Application>,
    @InjectRepository(CitizenDocument) private readonly documents: Repository<CitizenDocument>,
    private readonly services: ServicesService,
    private readonly journeys: JourneysService,
    private readonly events: JourneyEventsService,
    private readonly eligibility: EligibilityService,
    private readonly audit: AuditService,
    private readonly knowledge: KnowledgeService,
    private readonly graph: ServiceGraphService,
    private readonly explain: ExplainabilityService,
    private readonly nba: NextBestActionService,
    private readonly llm: LlmClient,
    private readonly cache: AiCacheService,
    private readonly observability: AiObservabilityService,
  ) {}

  // ---------------------------------------------------------------- NLU

  /** Stage 1-3: normalization + intent + entities + life event (cacheable). */
  classify(input: { message: string; language?: string }): {
    understanding: AiUnderstanding;
    intent: IntentClassification;
    lifeEvent: LifeEventClassification;
    entities: ExtractedEntity[];
  } {
    const norm = normalizeInput(input.message);
    const cacheKey = `nlu:${hashText(norm.normalized + '|' + norm.language)}`;
    const cached = this.cache.get<{ intent: IntentClassification; lifeEvent: LifeEventClassification; entities: ExtractedEntity[] }>(cacheKey);
    let intent = cached?.intent;
    let lifeEvent = cached?.lifeEvent;
    let entities = cached?.entities;
    if (!cached) {
      intent = classifyIntent(norm.normalized, norm.language);
      lifeEvent = classifyLifeEvent(norm.normalized, norm.language);
      entities = extractEntities(norm.normalized);
      this.cache.set(cacheKey, { intent, lifeEvent, entities });
    }

    const understanding: AiUnderstanding = {
      original_input: input.message,
      normalized_input: norm.normalized,
      detected_language: norm.language,
      intent: { name: intent.name, confidence: { state: intent.state, signals: intent.signals } },
      life_event: { name: lifeEvent.name, confidence: { state: lifeEvent.state, signals: lifeEvent.signals } },
      entities: entities.map((e) => ({ type: e.type, value: e.value, confidence: { state: e.state } })),
      // MVP template mode prompts no citizen profile fields (minimization);
      // LLM mode (when configured) may add relevant_profile_fields here.
      context_used: { turns: 0, profile_fields: [] },
    };
    return { understanding, intent, lifeEvent, entities };
  }

  // ---------------------------------------------------------------- RAG

  rag(query: string, opts: { service_slug?: string; limit?: number } = {}): Promise<{
    citations: Citation[];
    warnings: string[];
    corpus_version: string;
  }> {
    return (async () => {
      const service = opts.service_slug ? await this.serviceRepo.findOne({ where: { slug: opts.service_slug } }) : null;
      return this.knowledge.retrieve(query, { limit: opts.limit, service_id: service?.id ?? null });
    })();
  }

  // ---------------------------------------------------------------- ask

  async ask(citizenId: string, input: AskInput, correlationId: string | null) {
    const t0 = Date.now();
    const request_id = randomUUID();
    const llmInfo = this.llm.info();
    const lang = asAiLang(input.language);
    const inputHash = hashText(input.message);
    const warnings = new Set<string>();

    const recordAi = (extra: {
      journey_id?: string | null;
      status?: string;
      intent?: string | null;
      life_event?: string | null;
      confidence_state?: string | null;
      retrieval_count?: number | null;
      citation_count?: number | null;
      warning_codes?: string[] | null;
    }) =>
      this.observability.record({
        correlation_id: correlationId,
        citizen_id: citizenId,
        journey_id: extra.journey_id ?? null,
        request_kind: 'ASK',
        input_hash: inputHash,
        model: llmInfo.model,
        model_version: llmInfo.model_version,
        prompt_version: PROMPT_VERSIONS.explain,
        corpus_version: AI_CORPUS_VERSION,
        intent: extra.intent ?? null,
        life_event: extra.life_event ?? null,
        confidence_state: extra.confidence_state ?? null,
        retrieval_count: extra.retrieval_count ?? null,
        citation_count: extra.citation_count ?? null,
        latency_ms: Date.now() - t0,
        status: extra.status ?? 'OK',
        warning_codes: extra.warning_codes ?? null,
      });

    // ---- Guardrail 0: prompt-injection defense (before any NLU step).
    const scan = scanUserInput(input.message);
    if (scan.flagged) {
      recordAi({ status: 'REFUSED', intent: UNKNOWN_INTENT, warning_codes: ['PROMPT_INJECTION_DETECTED', ...scan.reasons], confidence_state: 'NONE' });
      this.audit.log({ correlation_id: correlationId, citizen_id: citizenId, action: 'ASSISTANT_QUERY_REFUSED', detail: { reasons: scan.reasons.slice(0, 4).join(',') } });
      return this.refusalResponse(citizenId, lang, request_id, correlationId, scan.reasons, llmInfo);
    }

    const { understanding, intent, lifeEvent, entities } = this.classify(input);
    understanding.context_used.turns = Math.min((input.context?.relevant_turns ?? []).length, 3);

    // ---- Context builder (data-minimized: current journey + ≤3 relevant turns;
    //      no bulk citizen history is pulled into the AI boundary).

    let journey: Journey | null = null;
    let lastSeq = 0;
    if (input.journey_id) {
      journey = await this.journeys.ownOrNull(citizenId, input.journey_id);
      if (journey) lastSeq = (await this.events.list(journey.id)).slice(-1)[0]?.seq ?? 0;
    }
    if (!journey) {
      const created = await this.journeys.create(
        citizenId,
        { intent: intent.name === UNKNOWN_INTENT ? 'unknown' : intent.name, life_event: lifeEvent.name ?? undefined },
        correlationId,
      );
      journey = created.journey;
      lastSeq = 0; // create() already appended the INTENT/LIFE_EVENT events
    }
    const tl = new TimelineBuilder(this.events, correlationId);

    // ---- Service graph + registry retrieval (never hallucinate services).
    // Only ACTIVE registry rows are candidates — the AI can only return what
    // the registry says exists.
    const activeServices = await this.serviceRepo.find({ where: { status: 'ACTIVE' } });
    const scored = activeServices
      .map((s) => {
        let score = 0;
        // 1 point per distinct registry keyword hit (script-independent).
        const seen = new Set<string>();
        for (const k of s.intent_keywords ?? []) {
          const kk = k.toLowerCase();
          if (!kk || seen.has(kk)) continue;
          if (understanding.normalized_input.includes(kk)) {
            seen.add(kk);
            score += 1;
          }
        }
        if (lifeEvent.name && s.life_events.includes(lifeEvent.name)) score += 1;
        // Entity boost only REINFORCES an existing signal — a lone entity hit
        // is too weak to surface a service (prevents false-positive cards).
        const benefitEntity = entities.find((e) => e.type === 'benefit_type');
        if (benefitEntity && s.service_type === 'benefit' && score > 0) score += 1;
        return { service: s, score };
      })
      // Minimum bar: at least one real signal (keyword, life-event or boost).
      .filter((x) => x.score >= 1)
      .sort((a, b) => b.score - a.score || a.service.slug.localeCompare(b.service.slug));

    const top = scored[0]?.service ?? null;

    if (scored.length > 0) {
      await tl.record(journey.id, {
        type: 'SERVICES_DISCOVERED',
        title: 'Services discovered',
        title_key: 'timeline.events.SERVICES_DISCOVERED',
        safe_metadata: { service_id: scored[0].service.id, note: `candidates:${scored.length}` },
      });
    }
    if (top) {
      await tl.record(journey.id, {
        type: 'SERVICES_FILTERED',
        title: 'Services filtered',
        title_key: 'timeline.events.SERVICES_FILTERED',
        safe_metadata: { service_id: top.id, tier: top.integration_tier },
      });
    }

    // ---- Official knowledge retrieval (RAG).
    const ragQuery = [understanding.normalized_input, ...entities.map((e) => e.value)].join(' ');
    const retrieval = await this.knowledge.retrieve(ragQuery, { limit: 4, service_id: top?.id ?? null });
    for (const w of retrieval.warnings) warnings.add(w);
    const citations = retrieval.citations;

    // ---- Deterministic eligibility (Member 2) — only when attributes provided.
    let evaluation: Awaited<ReturnType<EligibilityService['check']>> | null = null;
    let explanation: ExplanationCard | null = null;
    if (top && input.attributes && Object.keys(input.attributes).length > 0) {
      try {
        evaluation = await this.eligibility.check(
          citizenId,
          { service_id: top.id, attributes: input.attributes, verified_fields: input.verified_fields, journey_id: journey.id },
          correlationId ?? undefined,
        );
        explanation = await this.explain.explain(citizenId, evaluation.id, input.language);
      } catch {
        // Eligibility unavailable → structured null, never a guess.
        warnings.add('ELIGIBILITY_UNAVAILABLE');
      }
    }

    // ---- Documents: identified (registry) + matched (owned, real lookup).
    let docsBlock: { required: string[]; optional: string[]; matched: { type: string; trust_level: string }[] } | null = null;
    if (top) {
      const owned = await this.documents.find({ where: { citizen_id: citizenId } });
      const required = top.required_documents ?? [];
      const optional = top.optional_documents ?? [];
      const matched = owned.filter((d) => required.includes(d.type)).map((d) => ({ type: d.type, trust_level: d.trust_level }));
      docsBlock = { required, optional, matched };
      await tl.record(journey.id, {
        type: 'DOCUMENTS_IDENTIFIED',
        title: 'Documents identified',
        title_key: 'timeline.events.DOCUMENTS_IDENTIFIED',
        safe_metadata: { service_id: top.id, note: `required:${required.length}` },
      });
      for (const m of matched) {
        await tl.record(journey.id, {
          type: 'DOCUMENTS_MATCHED',
          title: 'Document matched',
          title_key: 'timeline.events.DOCUMENTS_MATCHED',
          safe_metadata: { document_type: m.type, trust_level: m.trust_level },
        });
      }
    }

    // ---- Next-best-action (deterministic signals).
    const application = top ? await this.applications.findOne({ where: { journey_id: journey.id, service_id: top.id } }) : null;
    const slaWarning =
      application?.sla_deadline != null &&
      new Date(application.sla_deadline).getTime() - Date.now() < 3 * 86400000;
    const followUps = top ? await this.graph.followUps(top.id) : [];
    const lowConfidence = intent.state === 'LOW' || intent.state === 'NONE';
    const actions: NextAction[] = this.nba.build({
      service: top,
      evaluation: evaluation ? { result: evaluation.result, review_status: evaluation.review_status } : null,
      application: application
        ? { id: application.id, canonical_status: application.canonical_status, sla_warning: slaWarning }
        : null,
      followUps,
      staleSource: warnings.has('STALE_SOURCE'),
      lowConfidence,
    });
    if (actions.length > 0 && top) {
      await tl.record(journey.id, {
        type: 'NEXT_ACTION',
        title: 'Next action suggested',
        title_key: 'timeline.events.NEXT_ACTION',
        safe_metadata: { service_id: top.id, note: actions[0].reason },
      });
    }
    if (lowConfidence && top) warnings.add('LOW_CONFIDENCE');

    // ---- Note (stale / cannot-verify) — never a free-invented answer.
    let note: string | null = null;
    if (citations.length === 0 && warnings.has('RAG_UNAVAILABLE')) note = RAG_REFUSAL[lang];
    else if (warnings.has('STALE_SOURCE')) note = STALE_NOTE[lang];

    // ---- Timeline read-back (everything that REALLY happened this request).
    const all = await this.events.list(journey.id);
    const timeline_events: TimelineEventOut[] = all
      .filter((e) => e.seq > lastSeq)
      .map((e) => ({
        event_id: e.id,
        journey_id: e.journey_id,
        step_type: e.type,
        status: e.status,
        safe_summary: this.safeSummary(e.type, e.safe_metadata),
        metadata: e.safe_metadata,
        correlation_id: correlationId,
        at: e.created_at instanceof Date ? e.created_at.toISOString() : String(e.created_at),
      }));

    // ---- Outbound guardrail validation (no prompt fragments, no PII).
    const outboundText = JSON.stringify({ citations, note, timeline_events, actions });
    const problems = validateOutbound(outboundText, [REFUSAL_MESSAGES.en, RAG_REFUSAL.en]);
    if (problems.length > 0) {
      this.logger.warn(`outbound validation issues (request ${request_id}): ${problems.join(',')}`);
    }

    // ---- Observability + audit (PII-free).
    recordAi({
      journey_id: journey.id,
      status: 'OK',
      intent: intent.name,
      life_event: lifeEvent.name,
      confidence_state: intent.state,
      retrieval_count: citations.length,
      citation_count: citations.length,
      warning_codes: [...warnings],
    });
    this.audit.log({
      correlation_id: correlationId,
      citizen_id: citizenId,
      journey_id: journey.id,
      action: 'ASSISTANT_QUERY',
      detail: {
        engine: 'AI_PIPELINE_V1',
        ai_mode: llmInfo.mode,
        intent: intent.name,
        life_event: lifeEvent.name ?? null,
        matched_service: top?.id ?? null,
        citations: citations.length,
      },
    });

    return {
      engine: 'AI_PIPELINE_V1',
      ai_mode: llmInfo.mode,
      provider_status: llmInfo.providerStatus,
      request_id,
      correlation_id: correlationId ?? undefined,
      journey_id: journey.id,
      // Back-compat semantics: top-level intent = detected life event name.
      intent: lifeEvent.name ?? UNKNOWN_INTENT,
      life_event: lifeEvent.name ?? null,
      understanding,
      services: scored.slice(0, 5).map(({ service, score }) => ({ ...this.services.summary(service), score })),
      eligibility: evaluation
        ? {
            evaluation: {
              id: evaluation.id,
              service_id: evaluation.service_id,
              result: evaluation.result,
              review_status: evaluation.review_status,
              rule_version: evaluation.rule_version,
            },
            explanation,
          }
        : null,
      documents: docsBlock,
      citations,
      timeline_events,
      next_actions: actions,
      workflow_ready: top
        ? {
            service_id: top.id,
            service_slug: top.slug,
            intent: intent.name,
            life_event: lifeEvent.name,
            required_documents: top.required_documents ?? [],
            optional_documents: top.optional_documents ?? [],
            journey_id: journey.id,
          }
        : null,
      warnings: [...warnings],
      note,
      ai: {
        model: llmInfo.model,
        model_version: llmInfo.model_version,
        prompt_version: PROMPT_VERSIONS.explain,
        corpus_version: AI_CORPUS_VERSION,
        provider_status: llmInfo.providerStatus,
        latency_ms: Date.now() - t0,
      },
    };
  }

  // ---------------------------------------------------------------- helpers

  private refusalResponse(
    _citizenId: string,
    lang: 'en' | 'hi' | 'mr',
    request_id: string,
    correlationId: string | null,
    reasons: string[],
    llmInfo: { mode: string; providerStatus: string; model: string; model_version: string },
  ) {
    return {
      engine: 'AI_PIPELINE_V1',
      ai_mode: llmInfo.mode,
      provider_status: llmInfo.providerStatus,
      request_id,
      correlation_id: correlationId ?? undefined,
      journey_id: null,
      intent: UNKNOWN_INTENT,
      life_event: null,
      understanding: {
        original_input: '',
        normalized_input: '',
        detected_language: 'unknown',
        intent: { name: UNKNOWN_INTENT, confidence: { state: 'NONE', signals: reasons } },
        life_event: { name: null, confidence: { state: 'NONE', signals: [] } },
        entities: [],
        context_used: { turns: 0, profile_fields: [] },
      },
      services: [],
      eligibility: null,
      documents: null,
      citations: [],
      timeline_events: [],
      next_actions: [{ label_key: 'chat.next.tryExample', href: '/services', primary: true, reason: 'refused' }],
      workflow_ready: null,
      warnings: ['PROMPT_INJECTION_DETECTED'],
      note: REFUSAL_MESSAGES[lang],
      ai: {
        model: llmInfo.model,
        model_version: llmInfo.model_version,
        prompt_version: PROMPT_VERSIONS.refusal,
        corpus_version: AI_CORPUS_VERSION,
        provider_status: llmInfo.providerStatus,
        latency_ms: 0,
      },
    };
  }

  private safeSummary(type: string, meta: Record<string, unknown> | null): string | null {
    const m = (meta ?? {}) as Record<string, unknown>;
    switch (type) {
      case 'INTENT_DETECTED':
        return m.intent ? `Detected intent: ${String(m.intent)}` : null;
      case 'LIFE_EVENT_DETECTED':
        return m.life_event ? `Detected life event: ${String(m.life_event)}` : null;
      case 'SERVICES_DISCOVERED':
        return 'Discovered candidate services';
      case 'SERVICES_FILTERED':
        return 'Selected a matching service';
      case 'ELIGIBILITY_EVALUATED':
        return m.result ? `Eligibility checked: ${String(m.result)}` : null;
      case 'DOCUMENTS_IDENTIFIED':
        return 'Identified required documents for the service';
      case 'DOCUMENTS_MATCHED':
        return m.document_type ? `Found matching document: ${String(m.document_type)}` : null;
      case 'NEXT_ACTION':
        return m.note ? `Suggested next step (${String(m.note)})` : null;
      default:
        return null;
    }
  }
}
