import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Consent } from '../entities/consent.entity';
import { CreateConsentDto } from './dto/create-consent.dto';

@Injectable()
export class ConsentService {
  constructor(
    @InjectRepository(Consent)
    private readonly consentRepository: Repository<Consent>,
  ) {}

  async create(createConsentDto: CreateConsentDto) {
    const granted = createConsentDto.granted ?? true;

    const consent = this.consentRepository.create({
      citizenId: createConsentDto.citizenId,
      serviceId: createConsentDto.serviceId,
      scopes: createConsentDto.scopes,
      granted,
      grantedAt: granted ? new Date() : null,
      revokedAt: granted ? null : new Date(),
    });

    return this.consentRepository.save(consent);
  }

  async findByCitizenAndService(
    citizenId: number,
    serviceId: number,
  ) {
    const consent = await this.consentRepository.findOne({
      where: {
        citizenId,
        serviceId,
      },
      order: {
        id: 'DESC',
      },
    });

    if (!consent) {
      throw new NotFoundException(
        `Consent not found for citizen ${citizenId} and service ${serviceId}`,
      );
    }

    return consent;
  }
}