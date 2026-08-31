import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CitizenController } from './citizen.controller';
import { CitizenService } from './citizen.service';
import { Citizen } from '../entities/citizen.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Citizen])],
  controllers: [CitizenController],
  providers: [CitizenService],
})
export class CitizenModule {}