import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Service, ServiceGraphEdge } from '../../database/entities';

/**
 * Service Graph access (Member 3).
 *
 * Relational edges (canonical PostgreSQL/SQLite target — no Neo4j in the
 * MVP). Relationships:
 *   LIFE_EVENT → SERVICE      (has_service)
 *   SERVICE → DOCUMENT        (requires_document / optional_document)
 *   SERVICE → DEPARTMENT      (provided_by)
 *   SERVICE → PORTAL          (portal / adapter)
 *   SERVICE → SERVICE         (follow_up — declared MVP_NBA_MAP only)
 *
 * The graph never contains edges the AI invented: it is seeded from the
 * Service Registry and explicitly declared MVP relationships only.
 */
@Injectable()
export class ServiceGraphService {
  constructor(
    @InjectRepository(ServiceGraphEdge) private readonly edges: Repository<ServiceGraphEdge>,
    @InjectRepository(Service) private readonly services: Repository<Service>,
  ) {}

  edgesFrom(fromType: string, fromId: string): Promise<ServiceGraphEdge[]> {
    return this.edges.find({ where: { from_type: fromType, from_id: fromId } });
  }

  /** Services linked to a life event via graph edges. */
  async servicesByLifeEvent(lifeEvent: string): Promise<Service[]> {
    const rows = await this.edges.find({ where: { from_type: 'LIFE_EVENT', from_id: lifeEvent, relation: 'has_service' } });
    const ids = rows.map((r) => r.to_id);
    if (ids.length === 0) return [];
    return this.services.find({ where: ids.map((id) => ({ id, status: 'ACTIVE' })) });
  }

  /** Declared follow-up services (NBA), ACTIVE only. */
  async followUps(serviceId: string): Promise<Service[]> {
    const rows = await this.edges.find({ where: { from_type: 'SERVICE', from_id: serviceId, relation: 'follow_up' } });
    const ids = rows.map((r) => r.to_id);
    if (ids.length === 0) return [];
    return this.services.find({ where: ids.map((id) => ({ id, status: 'ACTIVE' })) });
  }

  /** Full neighborhood of a service (documents, department, portal, follow-ups). */
  async neighborhood(serviceId: string): Promise<{
    documents: { type: string; kind: 'required' | 'optional' }[];
    departments: string[];
    portals: string[];
    follow_ups: string[];
  }> {
    const rows = await this.edges.find({ where: { from_type: 'SERVICE', from_id: serviceId } });
    const out = {
      documents: [] as { type: string; kind: 'required' | 'optional' }[],
      departments: [] as string[],
      portals: [] as string[],
      follow_ups: [] as string[],
    };
    for (const r of rows) {
      if (r.to_type === 'DOCUMENT' && (r.relation === 'requires_document' || r.relation === 'optional_document')) {
        out.documents.push({ type: r.to_id, kind: r.relation === 'requires_document' ? 'required' : 'optional' });
      } else if (r.to_type === 'DEPARTMENT') {
        out.departments.push(r.to_id);
      } else if (r.to_type === 'PORTAL') {
        out.portals.push(r.to_id);
      } else if (r.to_type === 'SERVICE' && r.relation === 'follow_up') {
        out.follow_ups.push(r.to_id);
      }
    }
    return out;
  }
}
