import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Citizen } from '../entities/citizen.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(Citizen)
    private readonly citizenRepository: Repository<Citizen>,
  ) {}

  async create(data: Partial<Citizen>) {
    const citizen = this.citizenRepository.create(data);
    return this.citizenRepository.save(citizen);
  }

  async findOne(id: number) {
    return this.citizenRepository.findOne({
      where: { id },
    });
  }
}