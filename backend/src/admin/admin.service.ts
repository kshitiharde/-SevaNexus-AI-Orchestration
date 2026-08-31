import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { Application } from '../entities/application.entity';
import { Service } from '../entities/service.entity';
import { Audit } from '../entities/audit.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Application)
    private readonly applicationRepository: Repository<Application>,

    @InjectRepository(Service)
    private readonly serviceRepository: Repository<Service>,

    @InjectRepository(Audit)
    private readonly auditRepository: Repository<Audit>,
  ) {}

  // =========================
  // APPLICATION MANAGEMENT
  // =========================

  async getAllApplications() {
    return await this.applicationRepository.find();
  }

  async updateApplicationStatus(id: number, status: string) {
    const application = await this.applicationRepository.findOne({
      where: { id },
    });

    if (!application) {
      throw new NotFoundException('Application not found');
    }

    // Save old status BEFORE changing it
    const oldStatus = application.status;

    // Update status
    application.status = status;

    const updatedApplication =
      await this.applicationRepository.save(application);

    // Create audit record
    const audit = this.auditRepository.create({
      action: 'Application status updated',
      citizenId: application.citizenId,
      performedBy: 'admin',
      details: {
        applicationId: application.id,
        oldStatus: oldStatus,
        newStatus: status,
      },
    });

    await this.auditRepository.save(audit);

    return updatedApplication;
  }

  // =========================
  // SERVICE MANAGEMENT
  // =========================

  async getAllServices() {
    return await this.serviceRepository.find();
  }

  async createService(data: any) {
    const service = this.serviceRepository.create({
      name: data.name,
      description: data.description,
      department: data.department,
      metadata: data.metadata,
      active: data.active ?? true,
    });

    return await this.serviceRepository.save(service);
  }

  async updateService(id: number, data: any) {
    const service = await this.serviceRepository.findOne({
      where: { id },
    });

    if (!service) {
      throw new NotFoundException('Service not found');
    }

    Object.assign(service, data);

    return await this.serviceRepository.save(service);
  }

  // =========================
  // AUDIT LOGS
  // =========================

  async getAuditLogs() {
    return await this.auditRepository.find({
      order: {
        createdAt: 'DESC',
      },
    });
  }
}