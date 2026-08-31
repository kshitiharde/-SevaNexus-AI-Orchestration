import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';

import { ApplicationsService } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';

@Controller('applications')
export class ApplicationsController {
  constructor(
    private readonly applicationsService: ApplicationsService,
  ) {}

  @Post()
  create(@Body() createApplicationDto: CreateApplicationDto) {
    return this.applicationsService.create(createApplicationDto);
  }

  @Get('citizen/:citizenId')
  findByCitizen(
    @Param('citizenId', ParseIntPipe) citizenId: number,
  ) {
    return this.applicationsService.findByCitizen(citizenId);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.applicationsService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: any,
  ) {
    return this.applicationsService.update(id, data);
  }
}