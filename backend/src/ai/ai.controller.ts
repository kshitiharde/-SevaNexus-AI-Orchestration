import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { IsArray, IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../common/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { Roles } from '../common/roles.decorator';
import { AiPipelineService } from './ai-pipeline.service';
import { KnowledgeService } from './rag/knowledge.service';
import { ExplainabilityService } from './explain/explainability.service';
import { AiObservabilityService } from './ai-observability.service';
import { LlmClient } from './llm/llm-client';
import { hashText } from './rag/embedder';
import { AI_CORPUS_VERSION } from '../database/seed-ai';
import { PROMPT_VERSIONS } from './prompts';
import { Errors } from '../common/errors';

/**
 * AI & Intelligence API (Member 3). All routes: JWT. Knowledge ingestion:
 * admin only (allowlist decisions are a governance action).
 */

export class AiIntentDto {
  @IsString()
  @MaxLength(1000)
  input: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  language?: string;
}

export class AiRagDto {
  @IsString()
  @MaxLength(1000)
  query: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  service_slug?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  limit?: number;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  language?: string;
}

export class AiExplainDto {
  @IsString()
  eligibility_evaluation_id: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  language?: string;
}

export class AiAskDto {
  @IsString()
  @MaxLength(1000)
  message: string;

  @IsOptional()
  @IsString()
  journey_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5)
  language?: string;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, unknown>;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  verified_fields?: string[];

  @IsOptional()
  @IsObject()
  context?: { goal?: string; relevant_turns?: string[] };
}

export class IngestSectionDto {
  @IsString()
  @MaxLength(120)
  heading: string;

  @IsString()
  @MaxLength(4000)
  text: string;
}

export class IngestSourceDto {
  @IsString()
  @MaxLength(120)
  slug: string;

  @IsString()
  @MaxLength(300)
  title: string;

  @IsString()
  @MaxLength(160)
  authority: string;

  @IsString()
  @MaxLength(300)
  reference: string;

  @IsIn(['SCHEME_GUIDELINE', 'NOTIFICATION', 'CITIZEN_CHARTER', 'FAQ'])
  document_type: 'SCHEME_GUIDELINE' | 'NOTIFICATION' | 'CITIZEN_CHARTER' | 'FAQ';

  @IsBoolean()
  approved: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  service_slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  document_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  effective_from?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  effective_until?: string;

  @IsOptional()
  @IsString()
  @MaxLength(24)
  last_verified?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestSectionDto)
  sections: IngestSectionDto[];
}

@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiController {
  constructor(
    private readonly pipeline: AiPipelineService,
    private readonly knowledge: KnowledgeService,
    private readonly explain: ExplainabilityService,
    private readonly observability: AiObservabilityService,
    private readonly llm: LlmClient,
  ) {}

  @Post('intent')
  intent(@Req() req: Request, @Body() dto: AiIntentDto) {
    const t0 = Date.now();
    const info = this.llm.info();
    const { understanding, intent, lifeEvent, entities } = this.pipeline.classify({ message: dto.input, language: dto.language });
    this.observability.record({
      correlation_id: req.correlationId ?? null,
      citizen_id: req.userId ?? null,
      request_kind: 'INTENT',
      input_hash: hashText(understanding.normalized_input),
      model: info.model,
      model_version: info.model_version,
      prompt_version: PROMPT_VERSIONS.guard,
      corpus_version: AI_CORPUS_VERSION,
      intent: intent.name,
      life_event: lifeEvent.name,
      confidence_state: intent.state,
      latency_ms: Date.now() - t0,
      status: 'OK',
    });
    return {
      intent: { name: intent.name, confidence: { state: intent.state, signals: intent.signals }, candidates: intent.candidates },
      life_event: { name: lifeEvent.name, confidence: { state: lifeEvent.state, signals: lifeEvent.signals }, candidates: lifeEvent.candidates },
      entities,
      detected_language: understanding.detected_language,
      normalized_input: understanding.normalized_input,
    };
  }

  @Post('rag')
  async rag(@Req() req: Request, @Body() dto: AiRagDto) {
    const t0 = Date.now();
    const info = this.llm.info();
    const result = await this.pipeline.rag(dto.query, { service_slug: dto.service_slug, limit: dto.limit });
    this.observability.record({
      correlation_id: req.correlationId ?? null,
      citizen_id: req.userId ?? null,
      request_kind: 'RAG',
      input_hash: hashText(dto.query),
      model: info.model,
      model_version: info.model_version,
      prompt_version: PROMPT_VERSIONS.rag_refusal,
      corpus_version: result.corpus_version,
      retrieval_count: result.citations.length,
      citation_count: result.citations.length,
      latency_ms: Date.now() - t0,
      status: 'OK',
      warning_codes: result.warnings,
    });
    return result;
  }

  @Post('explain')
  explainCard(@Req() req: Request, @Body() dto: AiExplainDto) {
    return this.explain.explain(req.userId!, dto.eligibility_evaluation_id, dto.language, req.correlationId ?? undefined);
  }

  @Post('ask')
  ask(@Req() req: Request, @Body() dto: AiAskDto) {
    return this.pipeline.ask(req.userId!, dto, req.correlationId ?? null);
  }

  @Post('knowledge/ingest')
  @Roles('admin')
  ingest(@Req() req: Request, @Body() dto: IngestSourceDto) {
    if (!dto.sections?.length) throw Errors.validation('At least one section is required.');
    return this.knowledge.ingest(req.userId!, dto, req.correlationId);
  }

  @Get('knowledge')
  @Roles('admin')
  knowledgeList(@Req() _req: Request) {
    return this.knowledge.list();
  }
}
