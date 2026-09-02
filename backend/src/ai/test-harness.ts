/**
 * Test harness for the Member 3 AI suites: boots the FULL app (all modules,
 * real migrations, synthetic seed incl. AI corpus) against an in-memory
 * SQLite. No external services, no real PII, no network.
 */
import 'reflect-metadata';

process.env.JWT_SECRET = 'test-secret-0123456789';
process.env.JWT_EXPIRES_IN = '2h';
process.env.RATE_LIMIT_LOGIN = '1000';
process.env.VOICE_PROVIDER = 'mock';
process.env.LLM_PROVIDER = 'template';
process.env.KNOWLEDGE_STALE_DAYS = '30';
delete process.env.REDIS_URL;

import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { entities } from '../database/entities';
import { InitialMigration1700000000000 } from '../database/migrations/1700000000000-initial';
import { AiSchemaMigration1750000000000 } from '../database/migrations/1750000000000-ai';
import { seedDemoData } from '../database/seed';
import { seedAiData } from '../database/seed-ai';
import { AllExceptionsFilter } from '../common/exception.filter';
import { CorrelationIdMiddleware } from '../common/correlation-id.middleware';
import { RedisModule } from '../redis/redis.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { ServicesModule } from '../services/services.module';
import { EligibilityModule } from '../eligibility/eligibility.module';
import { ConsentModule } from '../consent/consent.module';
import { DocumentsModule } from '../documents/documents.module';
import { JourneysModule } from '../journeys/journeys.module';
import { ApplicationsModule } from '../applications/applications.module';
import { GrievancesModule } from '../grievances/grievances.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { AssistantModule } from '../assistant/assistant.module';
import { AiModule } from './ai.module';
import { AdminModule } from '../admin/admin.module';
import { HealthModule } from '../health/health.module';

Logger.overrideLogger(['error']);

export async function createAiApp() {
  const orm: TypeOrmModuleOptions = {
    type: 'better-sqlite3',
    database: ':memory:',
    entities,
    migrations: [InitialMigration1700000000000, AiSchemaMigration1750000000000],
    migrationsRun: true,
    synchronize: false,
  };
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      TypeOrmModule.forRoot(orm),
      RedisModule,
      AuditModule,
      AuthModule,
      UsersModule,
      ServicesModule,
      EligibilityModule,
      ConsentModule,
      DocumentsModule,
      JourneysModule,
      ApplicationsModule,
      GrievancesModule,
      IntegrationsModule,
      AssistantModule,
      AiModule,
      AdminModule,
      HealthModule,
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const correlationIdMiddleware = new CorrelationIdMiddleware();
  app.use((req, res, next) => correlationIdMiddleware.use(req, res, next));
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.init();
  await seedDemoData(app.get(DataSource));
  await seedAiData(app.get(DataSource));
  return app;
}

export async function login(app: any, name: string, language?: string): Promise<{ token: string; citizen: any }> {
  const request = (await import('supertest')).default;
  const res = await request(app.getHttpServer())
    .post('/api/v1/auth/login')
    .send({ name, ...(language ? { language } : {}) });
  if (res.status !== 201) throw new Error(`login failed for ${name}: ${res.status} ${JSON.stringify(res.body)}`);
  return { token: res.body.token, citizen: res.body.citizen };
}
