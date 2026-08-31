import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';

import { CitizenService } from './citizen.service';
import { CreateCitizenDto } from './dto/create-citizen.dto';

@Controller('citizen')
export class CitizenController {
  constructor(
    private readonly citizenService: CitizenService,
  ) {}

  @Post()
  create(@Body() createCitizenDto: CreateCitizenDto) {
    return this.citizenService.create(createCitizenDto);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.citizenService.findOne(id);
  }
}