import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiEvent } from '../database/entities';

/**
 * AI observability (Member 3).
 *
 * Writes PII-free ai_event rows: input HASH only (never raw input), model /
 * prompt / corpus versions, classification outcome, retrieval/citation
 * counts, latency, warning codes and the correlation id. Consumed read-only
 * by governance (Member 5).
 */
@Injectable()
export class AiObservabilityService {
  private readonly logger = new Logger('AiObservability');

  constructor(@InjectRepository(AiEvent) private readonly repo: Repository<AiEvent>) {}

  record(entry: {
    correlation_id?: string | null;
    citizen_id?: string | null;
    journey_id?: string | null;
    request_kind: string;
    step?: string | null;
    input_hash?: string | null;
    model: string;
    model_version: string;
    prompt_version: string;
    corpus_version: string;
    intent?: string | null;
    life_event?: string | null;
    confidence_state?: string | null;
    retrieval_count?: number | null;
    citation_count?: number | null;
    latency_ms: number;
    status: string;
    warning_codes?: string[] | null;
  }): void {
    try {
      void this.repo
        .insert(
          this.repo.create({
            correlation_id: entry.correlation_id ?? null,
            citizen_id: entry.citizen_id ?? null,
            journey_id: entry.journey_id ?? null,
            request_kind: entry.request_kind,
            step: entry.step ?? null,
            input_hash: entry.input_hash ?? null,
            model: entry.model.slice(0, 80),
            model_version: entry.model_version.slice(0, 40),
            prompt_version: entry.prompt_version.slice(0, 40),
            corpus_version: entry.corpus_version.slice(0, 40),
            intent: (entry.intent ?? null)?.slice(0, 60) ?? null,
            life_event: (entry.life_event ?? null)?.slice(0, 60) ?? null,
            confidence_state: entry.confidence_state ?? null,
            retrieval_count: entry.retrieval_count ?? null,
            citation_count: entry.citation_count ?? null,
            latency_ms: entry.latency_ms,
            status: entry.status,
            warning_codes: entry.warning_codes ?? null,
          }),
        )
        .catch((err: Error) => this.logger.warn(`ai_event insert failed: ${err.message}`));
    } catch (err) {
      this.logger.warn(`ai_event record failed: ${(err as Error).message}`);
    }
  }
}
