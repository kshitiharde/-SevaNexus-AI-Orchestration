import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KnowledgeChunk, KnowledgeSource, Service } from '../../database/entities';
import { Errors } from '../../common/errors';
import { AuditService } from '../../audit/audit.service';
import { AI_CORPUS_VERSION } from '../../database/seed-ai';
import { cosine, embedLocal, hashText } from './embedder';
import { scanRetrievedContent } from '../guardrails/guardrails';

/**
 * RAG knowledge service (Member 3).
 *
 * Pipeline: source (allowlisted) → chunking → metadata → embedding →
 * store → retrieval → citation.
 *
 * Non-negotiables:
 *  - only APPROVED (allowlisted) sources are ever chunked/retrieved;
 *  - citations are built ONLY from chunks that were actually retrieved —
 *    no fabricated citations, no URLs/dates that don't exist;
 *  - stale sources are flagged (STALE), never silently answered as current;
 *  - poisoned retrieved content is quarantined and excluded (data ≠ authority);
 *  - no retrieval match → the caller must return a "cannot verify" response,
 *    never a free-invented answer.
 */

export interface IngestSourceInput {
  slug: string;
  title: string;
  authority: string;
  reference: string;
  document_type: 'SCHEME_GUIDELINE' | 'NOTIFICATION' | 'CITIZEN_CHARTER' | 'FAQ';
  approved: boolean;
  service_slug?: string;
  document_date?: string;
  effective_from?: string;
  effective_until?: string;
  last_verified?: string;
  sections: { heading: string; text: string }[];
}

export interface Citation {
  source: string; // slug
  title: string;
  reference: string;
  relevant_excerpt: string;
  document_date: string | null;
  last_verified: string;
  effective_from: string | null;
  effective_until: string | null;
  authority: string;
  status: 'CURRENT' | 'STALE';
  chunk_id: string;
}

export interface RetrievalResult {
  citations: Citation[];
  warnings: string[]; // RAG_UNAVAILABLE | STALE_SOURCE | RAG_CONTENT_SUSPICIOUS
  corpus_version: string;
}

const EXCERPT_MAX = 280;
/**
 * Relevance floor for local-hash embeddings, calibrated on the synthetic
 * corpus (measured gap: unrelated ≤ ~0.14, related ≥ ~0.23). A real
 * embedding provider would use its own similarity semantics.
 */
const MIN_COSINE = 0.17;

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger('Knowledge');

  constructor(
    @InjectRepository(KnowledgeSource) private readonly sources: Repository<KnowledgeSource>,
    @InjectRepository(KnowledgeChunk) private readonly chunks: Repository<KnowledgeChunk>,
    private readonly audit: AuditService,
  ) {}

  corpusVersion(): string {
    return AI_CORPUS_VERSION;
  }

  /** Verification threshold in days (env-overridable, default 30). */
  private staleDays(): number {
    const raw = process.env.KNOWLEDGE_STALE_DAYS;
    const n = raw ? Number(raw) : 30;
    return Number.isFinite(n) && n > 0 ? n : 30;
  }

  private sourceStatus(s: KnowledgeSource): 'CURRENT' | 'STALE' {
    const ageDays = (Date.now() - new Date(s.last_verified).getTime()) / 86400000;
    return ageDays > this.staleDays() ? 'STALE' : 'CURRENT';
  }

  /**
   * Ingest (re-ingest) an official source. `approved: true` is the allowlist
   * decision — only such sources are chunked + embedded. Everything else is
   * stored as NOT_TRUSTED and never indexed (no silent corpus pollution).
   */
  async ingest(citizenId: string | null, input: IngestSourceInput, correlationId?: string): Promise<KnowledgeSource> {
    const existing = await this.sources.findOne({ where: { slug: input.slug } });
    const service = input.service_slug
      ? await this.findServiceBySlug(input.service_slug)
      : null;
    if (input.service_slug && !service) throw Errors.notFound(`Service '${input.service_slug}'`);

    const source = await this.sources.save(
      this.sources.create({
        id: existing?.id,
        slug: input.slug,
        title: input.title.slice(0, 300),
        authority: input.authority.slice(0, 160),
        reference: input.reference.slice(0, 300),
        document_type: input.document_type,
        status: input.approved ? 'APPROVED' : 'NOT_TRUSTED',
        corpus_version: AI_CORPUS_VERSION,
        document_date: input.document_date ?? null,
        effective_from: input.effective_from ?? null,
        effective_until: input.effective_until ?? null,
        last_verified: input.last_verified ? new Date(input.last_verified) : new Date(),
        service_id: service?.id ?? existing?.service_id ?? null,
      }),
    );

    if (input.approved) {
      // Re-ingest replaces the working index for this source (audit-logged).
      await this.chunks.delete({ source_id: source.id });
      let poisoned = 0;
      for (let i = 0; i < input.sections.length; i++) {
        const section = input.sections[i];
        const text = `${section.heading}: ${section.text}`.slice(0, 4000);
        const scan = scanRetrievedContent(text);
        const status = scan.flagged ? 'QUARANTINED' : 'ACTIVE';
        if (scan.flagged) poisoned++;
        await this.chunks.save(
          this.chunks.create({
            source_id: source.id,
            seq: i,
            text,
            embedding: JSON.stringify(embedLocal(text)),
            status,
          }),
        );
      }
      if (poisoned > 0) {
        this.logger.warn(`ingest of ${input.slug}: ${poisoned} section(s) quarantined (injection-like content).`);
      }
    }

    this.audit.log({
      correlation_id: correlationId ?? null,
      citizen_id: citizenId,
      action: input.approved ? 'KNOWLEDGE_INGESTED' : 'KNOWLEDGE_REJECTED_NOT_TRUSTED',
      entity_type: 'knowledge_source',
      entity_id: source.id,
      detail: { slug: input.slug, sections: input.sections.length, approved: input.approved },
    });

    return source;
  }

  private async findServiceBySlug(slug: string): Promise<Service | null> {
    return this.sources.manager.findOne(Service, { where: { slug } });
  }

  async list(): Promise<
    (Pick<KnowledgeSource, 'slug' | 'title' | 'authority' | 'document_type' | 'status' | 'document_date' | 'last_verified' | 'corpus_version'> & {
      source_status: 'CURRENT' | 'STALE';
      chunk_count: number;
    })[]
  > {
    const rows = await this.sources.find();
    const out: (Pick<KnowledgeSource, 'slug' | 'title' | 'authority' | 'document_type' | 'status' | 'document_date' | 'last_verified' | 'corpus_version'> & {
      source_status: 'CURRENT' | 'STALE';
      chunk_count: number;
    })[] = [];
    for (const s of rows) {
      const count = await this.chunks.count({ where: { source_id: s.id } });
      out.push({
        slug: s.slug,
        title: s.title,
        authority: s.authority,
        document_type: s.document_type,
        status: s.status,
        document_date: s.document_date,
        last_verified: s.last_verified,
        corpus_version: s.corpus_version,
        source_status: this.sourceStatus(s),
        chunk_count: count,
      });
    }
    return out;
  }

  /**
   * Retrieval over the allowlisted corpus. Returns actual retrieved chunks as
   * citations (or an empty list + RAG_UNAVAILABLE — the caller must then
   * answer "cannot verify", never from memory).
   */
  async retrieve(query: string, opts: { limit?: number; service_id?: string | null } = {}): Promise<RetrievalResult> {
    const limit = Math.min(opts.limit ?? 4, 8);
    const sources = await this.sources.find({ where: { status: 'APPROVED' } });
    if (sources.length === 0) return { citations: [], warnings: ['RAG_UNAVAILABLE'], corpus_version: this.corpusVersion() };

    const chunkRows = await this.chunks.find({ where: { status: 'ACTIVE' } });
    if (chunkRows.length === 0) return { citations: [], warnings: ['RAG_UNAVAILABLE'], corpus_version: this.corpusVersion() };

    const qv = embedLocal(query);
    const bySource = new Map<string, KnowledgeSource>();
    for (const s of sources) bySource.set(s.id, s);

    let pool = chunkRows;
    if (opts.service_id) {
      const forService = pool.filter((c) => bySource.get(c.source_id)?.service_id === opts.service_id);
      // Service-linked chunks first; fall back to the full corpus (e.g. citizen charter).
      pool = forService.length > 0 ? forService : pool;
    }

    const scored = pool
      .map((c) => {
        let vec: number[];
        try {
          vec = JSON.parse(c.embedding) as number[];
        } catch {
          return null;
        }
        return { chunk: c, score: cosine(qv, vec) };
      })
      .filter((x): x is { chunk: KnowledgeChunk; score: number } => x !== null)
      .sort((a, b) => b.score - a.score);

    const citations: Citation[] = [];
    const warnings = new Set<string>();
    for (const { chunk, score } of scored) {
      if (citations.length >= limit) break;
      if (score < MIN_COSINE) break;
      const source = bySource.get(chunk.source_id);
      if (!source) continue;

      // Poisoning defense at retrieval time as well: quarantined + excluded.
      const scan = scanRetrievedContent(chunk.text);
      if (scan.flagged) {
        await this.chunks.update({ id: chunk.id }, { status: 'QUARANTINED' });
        warnings.add('RAG_CONTENT_SUSPICIOUS');
        continue;
      }

      const status = this.sourceStatus(source);
      if (status === 'STALE') warnings.add('STALE_SOURCE');
      citations.push({
        source: source.slug,
        title: source.title,
        reference: source.reference,
        relevant_excerpt: chunk.text.length > EXCERPT_MAX ? chunk.text.slice(0, EXCERPT_MAX) + '…' : chunk.text,
        document_date: source.document_date,
        last_verified: source.last_verified instanceof Date ? source.last_verified.toISOString() : String(source.last_verified),
        effective_from: source.effective_from,
        effective_until: source.effective_until,
        authority: source.authority,
        status,
        chunk_id: chunk.id,
      });
    }

    if (citations.length === 0 && !warnings.size) warnings.add('RAG_UNAVAILABLE');
    return { citations, warnings: [...warnings], corpus_version: this.corpusVersion() };
  }

  /** Hash of the corpus (for governance provenance, Member 5). */
  async corpusFingerprint(): Promise<string> {
    const rows = await this.sources.find({ where: { status: 'APPROVED' } });
    return hashText(rows.map((r) => `${r.slug}:${r.corpus_version}`).join('|'));
  }
}
