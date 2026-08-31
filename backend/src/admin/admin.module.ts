import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

import { Application } from '../entities/application.entity';
import { Service } from '../entities/service.entity';
import { Audit } from '../entities/audit.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Application,
      Service,
      Audit,
    ]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}