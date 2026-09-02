import type { JourneyEvent } from '../../database/entities';
import type { JourneyEventsService } from '../../journeys/journey-events.service';

/**
 * AI reasoning timeline (Member 3, Journey Timeline backend logic).
 *
 * TRUTHFULNESS RULE: events are only produced for operations that actually
 * happened in this request. No event claims something the backend did not do
 * (e.g. a recommended-but-not-reused document is DOCUMENTS_MATCHED only when
 * a matching owned document was actually found; ELIGIBILITY_EVALUATED only
 * when the engine was actually invoked).
 *
 * Only the 15 canonical Member 2 event types are used (no ad-hoc types).
 * safe_metadata passes through the existing whitelist filter, and each
 * returned event carries the correlation id for governance traceability.
 */

export interface TimelineEventOut {
  event_id: string;
  journey_id: string;
  step_type: string;
  status: string;
  safe_summary: string | null;
  metadata: Record<string, unknown> | null;
  correlation_id: string | null;
  at: string;
}

export class TimelineBuilder {
  private readonly events: TimelineEventOut[] = [];

  constructor(
    private readonly eventsService: JourneyEventsService,
    private readonly correlationId: string | null,
  ) {}

  produced(): TimelineEventOut[] {
    return this.events;
  }

  /** Append if the operation really happened; returns the out-row. */
  async record(
    journeyId: string,
    input: {
      type: string;
      title: string;
      title_key?: string;
      safe_metadata?: Record<string, unknown> | null;
      status?: 'DONE' | 'PENDING' | 'FAILED';
    },
  ): Promise<TimelineEventOut | null> {
    const ev = await this.eventsService.append(journeyId, input);
    if (!ev) return null;
    const row: TimelineEventOut = {
      event_id: ev.id,
      journey_id: ev.journey_id,
      step_type: ev.type,
      status: ev.status,
      safe_summary: this.safeSummary(ev.type, input.safe_metadata ?? null),
      metadata: ev.safe_metadata,
      correlation_id: this.correlationId,
      at: ev.created_at instanceof Date ? ev.created_at.toISOString() : String(ev.created_at),
    };
    this.events.push(row);
    return row;
  }

  /** Human-safe one-line summary from whitelisted metadata (no PII possible). */
  private safeSummary(type: string, meta: Record<string, unknown> | null): string | null {
    const m = (meta ?? {}) as Record<string, unknown>;
    switch (type) {
      case 'INTENT_DETECTED':
        return m.intent ? `Detected intent: ${String(m.intent)}` : null;
      case 'LIFE_EVENT_DETECTED':
        return m.life_event ? `Detected life event: ${String(m.life_event)}` : null;
      case 'SERVICES_DISCOVERED':
        return m.service_id ? `Discovered candidate services` : null;
      case 'SERVICES_FILTERED':
        return m.service_id ? `Selected a matching service` : null;
      case 'ELIGIBILITY_EVALUATED':
        return m.result ? `Eligibility checked: ${String(m.result)}` : null;
      case 'DOCUMENTS_IDENTIFIED':
        return 'Identified required documents for the service';
      case 'DOCUMENTS_MATCHED':
        return m.document_type ? `Found matching document: ${String(m.document_type)}` : null;
      case 'NEXT_ACTION':
        return m.note ? `Suggested next step (${String(m.note)})` : null;
      default:
        return null;
    }
  }
}
