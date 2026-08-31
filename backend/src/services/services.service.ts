import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Service } from '../entities/service.entity';
import { CreateServiceDto } from './dto/create-service.dto';

@Injectable()
export class ServicesService {
  constructor(
    @InjectRepository(Service)
    private readonly serviceRepository: Repository<Service>,
  ) {}

  async create(createServiceDto: CreateServiceDto) {
    const service = this.serviceRepository.create(createServiceDto);

    return this.serviceRepository.save(service);
  }

  async findAll() {
    return this.serviceRepository.find({
      order: {
        id: 'ASC',
      },
    });
  }

  async findOne(id: number) {
    const service = await this.serviceRepository.findOne({
      where: { id },
    });

    if (!service) {
      throw new NotFoundException(
        `Service with ID ${id} not found`,
      );
    }

    return service;
  }
}