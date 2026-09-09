import assert from 'node:assert/strict';
import { createTripDraft } from '../src/travel/domain';
import { evaluateLegalClaimPolicies, type LegalCheckResponse } from '../src/travel/legalContracts';
import type { LegalSourceProvider } from '../src/travel/providers';
import { LegalOrchestrationError, LegalOrchestrator } from '../server/travel/legalOrchestrator';

async function main() {
  const now = new Date('2026-09-09T11:00:00.000Z');
  const trip = createTripDraft({
    origin: 'Казань', destination: 'Стамбул', destinationUnknown: false,
    startDate: '2026-10-01', endDate: '2026-10-08', flexibleDates: false,
    durationDays: 1, travelerCount: 1, budgetLimitRub: 150000,
    vacationTypes: [], interests: [], transportPreferences: [], additionalNotes: '',
  }, 'acct-legal', now);

  let providerCalls = 0;
  const provider: LegalSourceProvider = {
    id: 'legal-fixture-v1',
    async checkRouteRequirements(request, context) {
      providerCalls += 1;
      assert.equal(request.scope, 'route_general');
      assert.equal(request.origin, 'Казань');
      assert.equal(request.destination, 'Стамбул');
      assert.equal('citizenship' in request, false);
      assert.equal('passport' in request, false);
      return {
        version: 1,
        providerId: 'legal-fixture-v1',
        requestId: context.requestId,
        retrievedAt: now.toISOString(),
        sources: [{
          id: 'official-entry',
          title: 'Официальные правила въезда',
          url: 'https://example.gov.test/entry',
          publisher: 'Official authority',
          sourceType: 'official',
          retrievedAt: now.toISOString(),
          effectiveUntil: '2026-12-31',
        }],
        claims: [{
          id: 'entry-general',
          category: 'entry',
          summary: 'Route-general requirement from an official source.',
          sourceIds: ['official-entry'],
          status: 'verified',
        }],
      } satisfies LegalCheckResponse;
    },
  };

  const orchestrator = new LegalOrchestrator({ provider, now: () => now, requestId: () => 'legal-request-1' });
  await assert.rejects(
    () => orchestrator.run('acct-foreign', trip),
    (error: unknown) => error instanceof LegalOrchestrationError && error.code === 'access_denied',
  );
  assert.equal(providerCalls, 0, 'ownership must fail before provider call');

  const result = await orchestrator.run('acct-legal', trip);
  assert.equal(providerCalls, 1);
  assert.equal(result.policies[0]?.authoritative, true);
  assert.equal(result.policies[0]?.freshness, 'current');

  await assert.rejects(
    () => new LegalOrchestrator({ provider: null, now: () => now, requestId: () => 'legal-request-2' }).run('acct-legal', trip),
    (error: unknown) => error instanceof LegalOrchestrationError && error.code === 'not_connected',
  );

  const noSourceProvider: LegalSourceProvider = {
    id: 'legal-no-source',
    async checkRouteRequirements(_request, context) {
      return {
        version: 1,
        providerId: 'legal-no-source',
        requestId: context.requestId,
        retrievedAt: now.toISOString(),
        sources: [],
        claims: [{ id: 'uncited', category: 'visa', summary: 'Uncited conclusion', sourceIds: [], status: 'verified' }],
      };
    },
  };
  await assert.rejects(
    () => new LegalOrchestrator({ provider: noSourceProvider, now: () => now, requestId: () => 'legal-request-3' }).run('acct-legal', trip),
    (error: unknown) => error instanceof LegalOrchestrationError
      && error.code === 'invalid_provider_response'
      && Boolean(error.validationErrors?.some((item) => item.code === 'missing_source')),
  );

  const secondaryVerifiedProvider: LegalSourceProvider = {
    id: 'legal-secondary',
    async checkRouteRequirements(_request, context) {
      return {
        version: 1,
        providerId: 'legal-secondary',
        requestId: context.requestId,
        retrievedAt: now.toISOString(),
        sources: [{ id: 'blog', title: 'Travel blog', url: 'https://example.test/legal', publisher: 'Example', sourceType: 'secondary', retrievedAt: now.toISOString(), effectiveUntil: '2026-12-31' }],
        claims: [{ id: 'visa-blog', category: 'visa', summary: 'Secondary source cannot verify a legal fact.', sourceIds: ['blog'], status: 'verified' }],
      };
    },
  };
  await assert.rejects(
    () => new LegalOrchestrator({ provider: secondaryVerifiedProvider, now: () => now, requestId: () => 'legal-request-4' }).run('acct-legal', trip),
    (error: unknown) => error instanceof LegalOrchestrationError
      && error.code === 'invalid_provider_response'
      && Boolean(error.validationErrors?.some((item) => item.code === 'non_official_verified_source')),
  );

  const unknownFreshness = structuredClone(result.response);
  delete unknownFreshness.sources[0]!.effectiveUntil;
  assert.deepEqual(evaluateLegalClaimPolicies(unknownFreshness, now)[0], { claimId: 'entry-general', freshness: 'unknown', authoritative: false });
  const expired = structuredClone(result.response);
  expired.sources[0]!.effectiveUntil = '2026-09-01';
  assert.deepEqual(evaluateLegalClaimPolicies(expired, now)[0], { claimId: 'entry-general', freshness: 'expired', authoritative: false });

  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () => orchestrator.run('acct-legal', trip, controller.signal),
    (error: unknown) => error instanceof LegalOrchestrationError && error.code === 'aborted',
  );

  console.log('legal sources/travel legal foundation: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
