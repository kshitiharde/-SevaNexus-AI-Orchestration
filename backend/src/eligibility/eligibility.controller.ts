import {
  Body,
  Controller,
  Post,
} from '@nestjs/common';

import { EligibilityService } from './eligibility.service';
import { CheckEligibilityDto } from './dto/check-eligibility.dto';

@Controller('eligibility')
export class EligibilityController {
  constructor(
    private readonly eligibilityService: EligibilityService,
  ) {}

  @Post()
  checkEligibility(
    @Body() checkEligibilityDto: CheckEligibilityDto,
  ) {
    return this.eligibilityService.checkEligibility(
      checkEligibilityDto.citizenId,
      checkEligibilityDto.serviceId,
    );
  }
}