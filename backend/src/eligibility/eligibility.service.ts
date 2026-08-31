import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Citizen } from '../entities/citizen.entity';
import { Service } from '../entities/service.entity';

@Injectable()
export class EligibilityService {
  constructor(
    @InjectRepository(Citizen)
    private readonly citizenRepository: Repository<Citizen>,

    @InjectRepository(Service)
    private readonly serviceRepository: Repository<Service>,
  ) {}

  async checkEligibility(
    citizenId: number,
    serviceId: number,
  ) {
    const citizen = await this.citizenRepository.findOne({
      where: { id: citizenId },
    });

    if (!citizen) {
      throw new NotFoundException(
        `Citizen with ID ${citizenId} not found`,
      );
    }

    const service = await this.serviceRepository.findOne({
      where: { id: serviceId },
    });

    if (!service) {
      throw new NotFoundException(
        `Service with ID ${serviceId} not found`,
      );
    }

    if (!service.active) {
      return {
        eligible: false,
        citizenId,
        serviceId,
        reasons: ['Service is inactive'],
      };
    }

    const rules = service.metadata || {};
    const reasons: string[] = [];

    if (rules.minAge !== undefined || rules.maxAge !== undefined) {
      const birthDate = new Date(citizen.dateOfBirth);
      const today = new Date();

      let age =
        today.getFullYear() - birthDate.getFullYear();

      const monthDifference =
        today.getMonth() - birthDate.getMonth();

      if (
        monthDifference < 0 ||
        (monthDifference === 0 &&
          today.getDate() < birthDate.getDate())
      ) {
        age--;
      }

      if (
        rules.minAge !== undefined &&
        age < rules.minAge
      ) {
        reasons.push(
          `Age ${age} is below minimum age ${rules.minAge}`,
        );
      }

      if (
        rules.maxAge !== undefined &&
        age > rules.maxAge
      ) {
        reasons.push(
          `Age ${age} is above maximum age ${rules.maxAge}`,
        );
      }
    }

    return {
      eligible: reasons.length === 0,
      citizenId,
      serviceId,
      reasons,
    };
  }
}
