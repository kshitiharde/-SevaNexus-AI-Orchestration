import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EligibilityController } from './eligibility.controller';
import { EligibilityService } from './eligibility.service';

import { Citizen } from '../entities/citizen.entity';
import { Service } from '../entities/service.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Citizen, Service]),
  ],
  controllers: [EligibilityController],
  providers: [EligibilityService],
})
export class EligibilityModule {}