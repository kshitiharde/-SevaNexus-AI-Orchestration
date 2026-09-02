import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiEvent, Application, CitizenDocument, Journey, KnowledgeChunk, KnowledgeSource, Service, ServiceGraphEdge } from '../database/entities';
import { ServicesModule } from '../services/services.module';
import { JourneysModule } from '../journeys/journeys.module';
import { EligibilityModule } from '../eligibility/eligibility.module';
import { AuditModule } from '../audit/audit.module';
import { AiController } from './ai.controller';
import { AiPipelineService } from './ai-pipeline.service';
import { KnowledgeService } from './rag/knowledge.service';
import { ServiceGraphService } from './graph/service-graph.service';
import { ExplainabilityService } from './explain/explainability.service';
import { NextBestActionService } from './nba/next-best-action.service';
import { LlmClient } from './llm/llm-client';
import { AiCacheService } from './ai-cache.service';
import { AiObservabilityService } from './ai-observability.service';

/**
 * Member 3 — AI & Intelligence module.
 * Deterministic NLU + service graph + RAG (allowlisted, cited, freshness-
 * aware) + explainability (Member 2 results only) + truthful timeline events
 * + NBA + guardrails + observability. No LLM decision authority anywhere.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      Service,
      Application,
      CitizenDocument,
      Journey,
      ServiceGraphEdge,
      KnowledgeSource,
      KnowledgeChunk,
      AiEvent,
    ]),
    ServicesModule,
    JourneysModule,
    EligibilityModule,
    AuditModule,
  ],
  controllers: [AiController],
  providers: [
    AiPipelineService,
    KnowledgeService,
    ServiceGraphService,
    ExplainabilityService,
    NextBestActionService,
    LlmClient,
    AiCacheService,
    AiObservabilityService,
  ],
  exports: [AiPipelineService, KnowledgeService, ServiceGraphService, ExplainabilityService],
})
export class AiModule {}
