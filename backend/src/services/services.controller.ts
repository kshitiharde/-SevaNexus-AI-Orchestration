import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';

import { ServicesService } from './services.service';
import { CreateServiceDto } from './dto/create-service.dto';

@Controller('services')
export class ServicesController {
  constructor(
    private readonly servicesService: ServicesService,
  ) {}

  @Post()
  create(@Body() createServiceDto: CreateServiceDto) {
    return this.servicesService.create(createServiceDto);
  }

  @Get()
  findAll() {
    return this.servicesService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.servicesService.findOne(id);
  }
}
