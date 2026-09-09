import assert from 'node:assert/strict';
import { createTripDraft } from '../src/travel/domain';
import {
  createPlanRequest,
  validatePlanProposal,
  type PlanProposal,
  type PlanRequest,
} from '../src/travel/planContracts';
import type { AIPlanProviderContext, AIProvider } from '../src/travel/providers';
import {
  PlanOrchestrationError,
  PlanOrchestrator,
  evaluatePlanPolicy,
} from '../server/travel/planOrchestrator';

function makeTrip(ownerScopeId = 'account-plan-a') {
  return createTripDraft({
    origin: 'Казань',
    destination: 'Сочи',
    destinationUnknown: false,
    startDate: '2026-10-01',
    endDate: '2026-10-08',
    flexibleDates: false,
    durationDays: 1,
    travelerCount: 2,
    budgetLimitRub: 150000,
    vacationTypes: ['Город'],
    interests: ['Еда'],
    transportPreferences: ['Поезд'],
    additionalNotes: 'Без ночных пересадок',
  }, ownerScopeId, new Date('2026-09-09T06:00:00.000Z'));
}

function makeProposal(tripId: string): PlanProposal {
  return {
    version: 1,
    tripId,
    summary: 'План-кандидат с отделёнными фактами и предположениями.',
    sources: [
      {
        id: 'source-price-1',
        kind: 'provider',
        label: 'Transport provider quote',
        providerId: 'transport-test',
        retrievedAt: '2026-09-09T06:30:00.000Z',
        validUntil: '2026-09-09T08:30:00.000Z',
      },
      {
        id: 'source-legal-1',
        kind: 'official',
        label: 'Official travel rules',
        sourceUrl: 'https://example.gov/rules',
        retrievedAt: '2026-09-09T06:30:00.000Z',
      },
    ],
    claims: [
      {
        id: 'claim-user-budget',
        category: 'budget',
        statement: 'Пользователь указал бюджет 150000 RUB.',
        provenance: 'user_input',
        confidence: 'high',
        sourceIds: [],
      },
      {
        id: 'claim-price',
        category: 'price',
        statement: 'Провайдер вернул цену маршрута.',
        provenance: 'provider_fact',
        confidence: 'high',
        sourceIds: ['source-price-1'],
      },
      {
        id: 'claim-legal',
        category: 'legal',
        statement: 'Юридический факт подтверждён официальным источником.',
        provenance: 'provider_fact',
        confidence: 'high',
        sourceIds: ['source-legal-1'],
      },
      {
        id: 'claim-itinerary',
        category: 'itinerary',
        statement: 'Предполагаемый порядок активностей удобнее начать утром.',
        provenance: 'model_inference',
        confidence: 'medium',
        sourceIds: [],
      },
    ],
    destinationSuggestions: [],
    itinerarySuggestions: [
      {
        id: 'itinerary-1',
        day: 1,
        title: 'Прогулка по центру',
        rationaleClaimIds: ['claim-itinerary'],
      },
    ],
    assumptions: ['Порядок активностей является рекомендацией, а не подтверждённым внешним фактом.'],
  };
}

async function expectPlanError(promise: Promise<unknown>, code: PlanOrchestrationError['code']) {
  await assert.rejects(promise, (error: unknown) => error instanceof PlanOrchestrationError && error.code === code);
}

async function main() {
  const trip = makeTrip();
  const request = createPlanRequest(trip, '  Подбери спокойный план  ');
  assert.equal(request.version, 1);
  assert.equal(request.trip.tripId, trip.id);
  assert.equal(request.trip.revision, trip.updatedAt);
  assert.equal(request.trip.travelerCount, 2);
  assert.equal(request.userPrompt, 'Подбери спокойный план');
  assert.equal('ownerScopeId' in (request.trip as unknown as Record<string, unknown>), false);
  assert.equal('travelers' in (request.trip as unknown as Record<string, unknown>), false);
  assert.equal('legalChecks' in (request.trip as unknown as Record<string, unknown>), false);
  assert.equal('mapPoints' in (request.trip as unknown as Record<string, unknown>), false);

  const proposal = makeProposal(trip.id);
  assert.deepEqual(validatePlanProposal(proposal, trip.id), []);

  const invalidLegal: PlanProposal = {
    ...proposal,
    claims: proposal.claims.map((claim) => claim.id === 'claim-legal'
      ? { ...claim, sourceIds: ['source-price-1'] }
      : claim),
  };
  assert.equal(
    validatePlanProposal(invalidLegal, trip.id).some((error) => error.code === 'official_source_required'),
    true,
  );

  const policy = evaluatePlanPolicy(proposal, new Date('2026-09-09T07:00:00.000Z'));
  assert.deepEqual(policy.authoritativeClaimIds.sort(), ['claim-legal', 'claim-price', 'claim-user-budget'].sort());
  assert.deepEqual(policy.nonAuthoritativeClaimIds, ['claim-itinerary']);
  assert.deepEqual(policy.expiredSourceClaimIds, []);

  const expiredProposal: PlanProposal = {
    ...proposal,
    sources: proposal.sources.map((source) => source.id === 'source-price-1'
      ? { ...source, validUntil: '2026-09-09T06:59:59.000Z' }
      : source),
  };
  const expiredPolicy = evaluatePlanPolicy(expiredProposal, new Date('2026-09-09T07:00:00.000Z'));
  assert.equal(expiredPolicy.authoritativeClaimIds.includes('claim-price'), false);
  assert.equal(expiredPolicy.expiredSourceClaimIds.includes('claim-price'), true);

  let providerCalls = 0;
  let observedRequest: PlanRequest | undefined;
  let observedContext: AIPlanProviderContext | undefined;
  const provider: AIProvider = {
    id: 'ai-contract-test',
    async planTrip(providerRequest, context, signal) {
      providerCalls += 1;
      observedRequest = providerRequest;
      observedContext = context;
      assert.equal(signal.aborted, false);
      return proposal;
    },
  };

  const orchestrator = new PlanOrchestrator({
    provider,
    timeoutMs: 500,
    now: () => new Date('2026-09-09T07:00:00.000Z'),
    requestId: () => 'plan-request-1',
  });
  const result = await orchestrator.run('account-plan-a', trip, 'Собери план');
  assert.equal(providerCalls, 1);
  assert.equal(observedRequest?.trip.tripId, trip.id);
  assert.equal(observedContext?.accountScopeId, 'account-plan-a');
  assert.equal(observedContext?.requestId, 'plan-request-1');
  assert.equal(result.audit.status, 'success');
  assert.equal(result.audit.providerId, 'ai-contract-test');
  assert.equal(result.policy.authoritativeClaimIds.includes('claim-price'), true);
  assert.equal(result.policy.nonAuthoritativeClaimIds.includes('claim-itinerary'), true);

  await expectPlanError(
    orchestrator.run('account-plan-b', trip, 'Чужой Trip'),
    'access_denied',
  );
  assert.equal(providerCalls, 1, 'Provider must not run for foreign-owned Trip');

  const disconnected = new PlanOrchestrator({
    provider: null,
    now: () => new Date('2026-09-09T07:00:00.000Z'),
    requestId: () => 'plan-request-disconnected',
  });
  await expectPlanError(disconnected.run('account-plan-a', trip), 'not_connected');

  const abortedController = new AbortController();
  abortedController.abort('test-cancel');
  await expectPlanError(
    orchestrator.run('account-plan-a', trip, undefined, abortedController.signal),
    'aborted',
  );
  assert.equal(providerCalls, 1, 'Provider must not run for a pre-aborted request');

  const invalidProvider: AIProvider = {
    id: 'ai-invalid-test',
    async planTrip() {
      return invalidLegal;
    },
  };
  const invalidOrchestrator = new PlanOrchestrator({
    provider: invalidProvider,
    timeoutMs: 500,
    now: () => new Date('2026-09-09T07:00:00.000Z'),
    requestId: () => 'plan-request-invalid',
  });
  await assert.rejects(
    invalidOrchestrator.run('account-plan-a', trip),
    (error: unknown) => error instanceof PlanOrchestrationError
      && error.code === 'invalid_provider_response'
      && error.validationErrors?.some((item) => item.code === 'official_source_required') === true,
  );

  const timeoutProvider: AIProvider = {
    id: 'ai-timeout-test',
    planTrip(_providerRequest, _context, signal) {
      return new Promise<PlanProposal>((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('provider aborted')), { once: true });
      });
    },
  };
  const timeoutOrchestrator = new PlanOrchestrator({
    provider: timeoutProvider,
    timeoutMs: 10,
    now: () => new Date('2026-09-09T07:00:00.000Z'),
    requestId: () => 'plan-request-timeout',
  });
  await expectPlanError(timeoutOrchestrator.run('account-plan-a', trip), 'timeout');

  console.log('plan real-data contract/orchestration policy smoke: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
