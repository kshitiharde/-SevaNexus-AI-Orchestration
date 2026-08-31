import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Application } from '../entities/application.entity';
import { CreateApplicationDto } from './dto/create-application.dto';

@Injectable()
export class ApplicationsService {
  constructor(
    @InjectRepository(Application)
    private readonly applicationRepository: Repository<Application>,
  ) {}

  async create(createApplicationDto: CreateApplicationDto) {
    const application = this.applicationRepository.create({
      citizenId: createApplicationDto.citizenId,
      serviceId: createApplicationDto.serviceId,
      data: createApplicationDto.data,
      status: 'SUBMITTED',
      submittedAt: new Date(),
    });

    return await this.applicationRepository.save(application);
  }

  async findOne(id: number) {
    const application = await this.applicationRepository.findOne({
      where: { id },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    return application;
  }

  async findByCitizen(citizenId: number) {
    return await this.applicationRepository.find({
      where: { citizenId },
    });
  }

  async update(id: number, data: any) {
    const application = await this.findOne(id);

    application.data = data;

    return await this.applicationRepository.save(application);
  }
}