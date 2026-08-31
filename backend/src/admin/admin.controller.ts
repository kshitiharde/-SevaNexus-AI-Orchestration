import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
} from '@nestjs/common';

import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
  ) {}

  @Get('applications')
  getAllApplications() {
    return this.adminService.getAllApplications();
  }

  @Patch('applications/:id/status')
  updateApplicationStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body('status') status: string,
  ) {
    return this.adminService.updateApplicationStatus(
      id,
      status,
    );
  }

  @Get('services')
  getAllServices() {
    return this.adminService.getAllServices();
  }

  @Post('services')
  createService(@Body() data: any) {
    return this.adminService.createService(data);
  }

  @Patch('services/:id')
  updateService(
    @Param('id', ParseIntPipe) id: number,
    @Body() data: any,
  ) {
    return this.adminService.updateService(id, data);
  }

  @Get('audit')
  getAuditLogs() {
    return this.adminService.getAuditLogs();
  }
}