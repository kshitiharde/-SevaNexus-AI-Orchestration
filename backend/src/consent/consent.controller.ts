import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';

import { ConsentService } from './consent.service';
import { CreateConsentDto } from './dto/create-consent.dto';

@Controller('consent')
export class ConsentController {
  constructor(
    private readonly consentService: ConsentService,
  ) {}

  @Post()
  create(@Body() createConsentDto: CreateConsentDto) {
    return this.consentService.create(createConsentDto);
  }

  @Get(':citizenId/:serviceId')
  findByCitizenAndService(
    @Param('citizenId', ParseIntPipe) citizenId: number,
    @Param('serviceId', ParseIntPipe) serviceId: number,
  ) {
    return this.consentService.findByCitizenAndService(
      citizenId,
      serviceId,
    );
  }
}