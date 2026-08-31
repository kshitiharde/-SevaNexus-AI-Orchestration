import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Citizen } from '../entities/citizen.entity';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Citizen]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}