import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ConsentController } from './consent.controller';
import { ConsentService } from './consent.service';
import { Consent } from '../entities/consent.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Consent])],
  controllers: [ConsentController],
  providers: [ConsentService],
})
export class ConsentModule {}