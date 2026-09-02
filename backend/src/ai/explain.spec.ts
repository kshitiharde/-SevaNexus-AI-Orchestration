/**
 * Member 3 — Explainability Card tests.
 *
 * Verifies: deterministic eligibility result is ECHOED (never recomputed),
 * plain-language explanation in EN/HI/MR, missing information/documents,
 * policy citation from the allowlisted corpus, review-note for conflicts,
 * and owner-only access (IDOR → 404).
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { Application } from '../database/entities';
import { createAiApp, login } from './test-harness';

describe('Explainability Card (Member 3)', () => {
  let app: Awaited<ReturnType<typeof createAiApp>>;
  let citizenToken: string;
  let otherToken: string;
  let scholarshipId: string;
  let rationId: string;

  beforeAll(async () => {
    app = await createAiApp();
    const c = await login(app, 'explainer');
    citizenToken = c.token;
    const o = await login(app, 'other-person');
    otherToken = o.token;
    const svcs = await request(app.getHttpServer()).get('/api/v1/services').set('Authorization', `Bearer ${citizenToken}`);
    scholarshipId = svcs.body.find((s: { slug: string }) => s.slug === 'state-scholarship').id;
    rationId = svcs.body.find((s: { slug: string }) => s.slug === 'food-subsidy-ration-card').id;
  });

  afterAll(async () => {
    await app.close();
  });

  const check = (serviceId: string, attributes: Record<string, unknown>, verified: string[] = []) =>
    request(app.getHttpServer())
      .post('/api/v1/eligibility/check')
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({ service_id: serviceId, attributes, verified_fields: verified });

  const explain = (evalId: string, language?: string) =>
    request(app.getHttpServer())
      .post('/api/v1/ai/explain')
      .set('Authorization', `Bearer ${citizenToken}`)
      .send({ eligibility_evaluation_id: evalId, ...(language ? { language } : {}) });

  it('ELIGIBLE: echoes result, explains matched rules, cites policy source (EN)', async () => {
    const ev = await check(scholarshipId, { age: 21, annual_family_income: 600000 }, ['annual_family_income']);
    expect(ev.body.result).toBe('ELIGIBLE');
    const res = await explain(ev.body.id);
    expect(res.status).toBe(201);
    expect(res.body.result).toBe('ELIGIBLE'); // verbatim echo — engine is authoritative
    expect(res.body.review_status).toBe('OK');
    expect(res.body.rules_matched.length).toBe(3);
    expect(res.body.rules_failed).toEqual([]);
    expect(res.body.missing_information).toEqual([]);
    expect(res.body.plain_language_explanation.length).toBeGreaterThan(40);
    expect(res.body.plain_language_explanation).toContain('Scholarship');
    expect(res.body.ai.mode).toBe('TEMPLATE_FALLBACK');
    expect(res.body.ai.provider_status).toBe('LOCAL_DETERMINISTIC');
    // missing documents: citizen has seeded AADHAAR; income cert + admission proof missing
    expect(res.body.missing_documents).toEqual(expect.arrayContaining(['INCOME_CERTIFICATE', 'ADMISSION_PROOF']));
    expect(res.body.missing_documents).not.toContain('AADHAAR');
    // policy citation from the allowlisted corpus (actually retrieved, not invented)
    expect(res.body.policy_reference).toBeTruthy();
    expect(res.body.policy_reference.source).toBe('scholarship-guidelines-2026');
    expect(res.body.policy_reference.status).toBe('CURRENT');
  });

  it('NOT_ELIGIBLE: lists failed rules, never flips the decision', async () => {
    const ev = await check(scholarshipId, { age: 45, annual_family_income: 2000000 });
    expect(ev.body.result).toBe('NOT_ELIGIBLE');
    const res = await explain(ev.body.id);
    expect(res.body.result).toBe('NOT_ELIGIBLE');
    expect(res.body.rules_failed.length).toBeGreaterThan(0);
    expect(res.body.plain_language_explanation).not.toMatch(/you meet the requirements/i);
  });

  it('INSUFFICIENT_INFORMATION: lists missing inputs exactly', async () => {
    const ev = await check(scholarshipId, { age: 21 });
    expect(ev.body.result).toBe('INSUFFICIENT_INFORMATION');
    const res = await explain(ev.body.id);
    expect(res.body.result).toBe('INSUFFICIENT_INFORMATION');
    expect(res.body.missing_information).toEqual(expect.arrayContaining(['annual_family_income']));
  });

  it('PENDING_MANUAL_REVIEW (conflicting rule versions): adds the review note', async () => {
    const ev = await check(rationId, { annual_family_income: 600000 }, ['annual_family_income']);
    expect(ev.body.result).toBe('INSUFFICIENT_INFORMATION');
    expect(ev.body.review_status).toBe('PENDING_MANUAL_REVIEW');
    const res = await explain(ev.body.id);
    expect(res.body.result).toBe('INSUFFICIENT_INFORMATION'); // echoed, not "resolved" by the explainer
    expect(res.body.review_status).toBe('PENDING_MANUAL_REVIEW');
    expect(res.body.plain_language_explanation).toMatch(/manual review/i);
  });

  it('LIKELY_ELIGIBLE: explains the unverified-cap state', async () => {
    const ev = await check(scholarshipId, { age: 21, annual_family_income: 600000 });
    expect(ev.body.result).toBe('LIKELY_ELIGIBLE');
    const res = await explain(ev.body.id);
    expect(res.body.result).toBe('LIKELY_ELIGIBLE');
    expect(res.body.plain_language_explanation).toMatch(/likely/i);
  });

  it('Hindi: explanation in Hindi for a Hindi request', async () => {
    const ev = await check(scholarshipId, { age: 21, annual_family_income: 600000 }, ['annual_family_income']);
    const res = await explain(ev.body.id, 'hi');
    expect(res.body.result).toBe('ELIGIBLE');
    expect(/[\u0900-\u097F]/.test(res.body.plain_language_explanation)).toBe(true);
    expect(res.body.plain_language_explanation).toContain('पात्र');
  });

  it('Marathi: explanation in Marathi for a Marathi request', async () => {
    const ev = await check(scholarshipId, { age: 21, annual_family_income: 600000 }, ['annual_family_income']);
    const res = await explain(ev.body.id, 'mr');
    expect(res.body.result).toBe('ELIGIBLE');
    expect(/[\u0900-\u097F]/.test(res.body.plain_language_explanation)).toBe(true);
    expect(res.body.plain_language_explanation).toContain('पात्र');
  });

  it('IDOR: another citizen cannot explain your evaluation (404)', async () => {
    const ev = await check(scholarshipId, { age: 21, annual_family_income: 600000 }, ['annual_family_income']);
    const res = await request(app.getHttpServer())
      .post('/api/v1/ai/explain')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ eligibility_evaluation_id: ev.body.id });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('explanation never claims live integrations or real provider status', async () => {
    const ev = await check(scholarshipId, { age: 21, annual_family_income: 600000 }, ['annual_family_income']);
    const res = await explain(ev.body.id);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('REAL');
    expect(res.body.ai.mode).toBe('TEMPLATE_FALLBACK');
  });

  it('observability: EXPLAIN event recorded with versions, correlation id, hashed input', async () => {
    const ds = app.get(DataSource) as DataSource;
    const ev = await check(scholarshipId, { age: 21, annual_family_income: 600000 }, ['annual_family_income']);
    const res = await explain(ev.body.id);
    const corr = res.headers['x-correlation-id'] as string;
    const rows: any[] = await ds.query(
      'SELECT * FROM ai_event WHERE request_kind = ? AND correlation_id = ?',
      ['EXPLAIN', corr],
    );
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.prompt_version).toBe('v1.0.0');
    expect(row.corpus_version).toMatch(/^corpus-/);
    expect(row.model).toBe('template-engine');
    expect(row.status).toBe('OK');
    expect(row.input_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(row.input_hash).not.toContain(ev.body.id); // raw input never persisted
    expect(row.correlation_id).toBe(corr);
  });
});
