import { Injectable } from '@nestjs/common';
import type { Service } from '../../database/entities';

/**
 * Next-Best-Action (Member 3).
 *
 * Deterministic, signal-driven, non-invasive:
 *  signals = journey milestone (application status) + eligibility result +
 *            declared follow-up edges (registry/graph) + source freshness.
 * Hard rules:
 *  - every action targets a REAL registry service or an existing application
 *    (no invented recommendations);
 *  - no personal profiling beyond the current journey/service context;
 *  - capped output (max 4).
 */

export interface NextAction {
  label_key: string;
  href: string;
  primary: boolean;
  reason: string;
}

export interface NbaContext {
  service: Service | null;
  evaluation: { result: string; review_status: string } | null;
  application: { id: string; canonical_status: string; sla_warning: boolean } | null;
  followUps: Service[];
  staleSource: boolean;
  lowConfidence: boolean;
}

const ACTIVE_STATUSES = new Set(['RECEIVED', 'UNDER_REVIEW', 'DOCUMENT_PENDING', 'OFFICER_VERIFICATION']);

@Injectable()
export class NextBestActionService {
  build(ctx: NbaContext): NextAction[] {
    const out: NextAction[] = [];

    if (!ctx.service) {
      // Menu-driven fallback (safe, no service claim).
      out.push({ label_key: 'chat.next.tryExample', href: '/services', primary: true, reason: 'no_service_matched' });
      return out;
    }

    const slug = ctx.service.slug;
    const app = ctx.application;
    const ev = ctx.evaluation;

    if (app) {
      if (ACTIVE_STATUSES.has(app.canonical_status)) {
        out.push({ label_key: 'chat.next.trackApplication', href: `/applications/${app.id}`, primary: true, reason: 'application_in_progress' });
        if (app.sla_warning) {
          out.push({ label_key: 'chat.next.verifySource', href: `/applications/${app.id}`, primary: false, reason: 'sla_warning' });
        }
      } else if (app.canonical_status === 'APPROVED') {
        if (ctx.followUps.length > 0) {
          const fu = ctx.followUps[0];
          out.push({ label_key: 'chat.next.relatedService', href: `/services/${fu.slug}`, primary: true, reason: 'related_service' });
        } else {
          out.push({ label_key: 'chat.next.viewService', href: `/services/${slug}`, primary: true, reason: 'view_service' });
        }
      } else {
        // REJECTED / CLOSED / FAILED / UNKNOWN — never guess the cause.
        out.push({ label_key: 'chat.next.verifySource', href: `/applications/${app.id}`, primary: true, reason: 'verify_with_office' });
      }
    } else if (ev && ev.result === 'INSUFFICIENT_INFORMATION') {
      out.push({ label_key: 'chat.next.continueJourney', href: `/apply/${slug}`, primary: true, reason: 'missing_information' });
    } else if (ev && ev.result === 'NOT_ELIGIBLE') {
      out.push({ label_key: 'chat.next.viewService', href: `/services/${slug}`, primary: true, reason: 'review_requirements' });
      out.push({ label_key: 'chat.next.verifySource', href: `/services/${slug}`, primary: false, reason: 'verify_with_office' });
    } else {
      out.push({ label_key: 'chat.next.viewService', href: `/services/${slug}`, primary: true, reason: 'view_service' });
      out.push({ label_key: 'chat.next.startApplication', href: `/apply/${slug}`, primary: false, reason: 'start_application' });
    }

    if (ctx.staleSource && out.length < 4) {
      out.push({ label_key: 'chat.next.verifySource', href: `/services/${slug}`, primary: false, reason: 'stale_source' });
    }
    if (ctx.lowConfidence && out.length < 4) {
      out.push({ label_key: 'chat.next.tryExample', href: '/services', primary: false, reason: 'low_confidence_menu' });
    }

    return out.slice(0, 4);
  }
}
