import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Citizen } from '../entities/citizen.entity';
import { CreateCitizenDto } from './dto/create-citizen.dto';

@Injectable()
export class CitizenService {
  constructor(
    @InjectRepository(Citizen)
    private readonly citizenRepository: Repository<Citizen>,
  ) {}

  async create(createCitizenDto: CreateCitizenDto) {
    const citizen = this.citizenRepository.create({
      fullName: createCitizenDto.fullName,
      email: createCitizenDto.email,
      phone: createCitizenDto.phone,
      ...(createCitizenDto.dateOfBirth
        ? { dateOfBirth: new Date(createCitizenDto.dateOfBirth) }
        : {}),
    });

    return this.citizenRepository.save(citizen);
  }

  async findOne(id: number) {
    const citizen = await this.citizenRepository.findOne({
      where: { id },
    });

    if (!citizen) {
      throw new NotFoundException(
        `Citizen with ID ${id} not found`,
      );
    }

    return citizen;
  }
}