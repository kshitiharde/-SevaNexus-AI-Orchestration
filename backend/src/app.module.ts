import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { ServicesModule } from './services/services.module';
import { EligibilityModule } from './eligibility/eligibility.module';
import { ConsentModule } from './consent/consent.module';
import { ApplicationsModule } from './applications/applications.module';

import { Citizen } from './entities/citizen.entity';
import { Identity } from './entities/identity.entity';
import { Service } from './entities/service.entity';
import { Application } from './entities/application.entity';
import { Document } from './entities/document.entity';
import { Consent } from './entities/consent.entity';
import { Audit } from './entities/audit.entity';
import { CitizenModule } from './citizen/citizen.module';
import { AdminModule } from './admin/admin.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'postgres',
      password: '3660',
      database: 'citizen_services',
      entities: [
        Citizen,
        Identity,
        Service,
        Application,
        Document,
        Consent,
        Audit,
      ],
      synchronize: true,
    }),

    AuthModule,
    UsersModule,
    ServicesModule,
    EligibilityModule,
    ConsentModule,
    ApplicationsModule,
    CitizenModule,
    AdminModule,
    RedisModule,
  ],
})
export class AppModule {}