import assert from 'node:assert/strict';
import { createTripDraft } from '../src/travel/domain';
import { createMapRouteRequest, evaluateMapResponsePolicy, validateMapRouteResponse, type MapRouteResponse } from '../src/travel/mapContracts';
import type { MapProvider } from '../src/travel/providers';
import { MapOrchestrationError, MapOrchestrator } from '../server/travel/mapOrchestrator';

async function main() {
  const now = new Date('2026-09-09T10:30:00.000Z');
  const trip = createTripDraft({
    origin: 'Казань', destination: 'Сочи', destinationUnknown: false,
    startDate: '2026-10-01', endDate: '2026-10-08', flexibleDates: false,
    durationDays: 1, travelerCount: 2, budgetLimitRub: 150000,
    vacationTypes: [], interests: [], transportPreferences: [], additionalNotes: '',
  }, 'acct-map', now);
  trip.mapPoints.push({ id: 'hotel', label: 'Отель', latitude: 43.585, longitude: 39.72, source: 'user' });

  const request = createMapRouteRequest(trip);
  assert.equal(request.points.length, 3);
  assert.equal(request.points[2]?.coordinate?.latitude, 43.585);
  assert.equal('ownerScopeId' in request, false);

  const provider: MapProvider = {
    id: 'map-fixture-v1',
    async resolveRouteMap(mapRequest, context) {
      const response: MapRouteResponse = {
        version: 1,
        providerId: 'map-fixture-v1',
        requestId: context.requestId,
        retrievedAt: now.toISOString(),
        points: [
          { id: 'p-origin', requestPointId: 'origin', label: 'Казань', coordinate: { latitude: 55.796, longitude: 49.108 }, resolution: 'provider_resolved' },
          { id: 'p-destination', requestPointId: 'destination', label: 'Сочи', coordinate: { latitude: 43.585, longitude: 39.72 }, resolution: 'provider_resolved' },
          { id: 'p-hotel', requestPointId: mapRequest.points[2]?.id ?? 'missing', label: 'Отель', coordinate: { latitude: 43.585, longitude: 39.72 }, resolution: 'provided' },
        ],
        routes: [{
          id: 'route-main',
          pointIds: ['p-origin', 'p-destination'],
          geometry: [
            { latitude: 55.796, longitude: 49.108 },
            { latitude: 50.0, longitude: 44.0 },
            { latitude: 43.585, longitude: 39.72 },
          ],
          distanceMeters: 1900000,
        }],
        attributions: [{ text: 'Fixture map source', url: 'https://example.test/maps' }],
      };
      return response;
    },
  };

  const orchestrator = new MapOrchestrator({ provider, now: () => now, requestId: () => 'map-request-1' });
  const result = await orchestrator.run('acct-map', trip);
  assert.equal(result.response.routes.length, 1);
  assert.equal(result.policy.freshness, 'unspecified');
  assert.equal(result.policy.routeAuthoritative, false);
  assert.equal(result.audit.status, 'success');

  await assert.rejects(() => orchestrator.run('acct-foreign', trip), (error: unknown) => error instanceof MapOrchestrationError && error.code === 'access_denied');
  await assert.rejects(() => new MapOrchestrator({ provider: null, now: () => now, requestId: () => 'map-request-2' }).run('acct-map', trip), (error: unknown) => error instanceof MapOrchestrationError && error.code === 'not_connected');

  const invalid = structuredClone(result.response);
  invalid.requestId = 'wrong';
  invalid.points[2]!.coordinate.latitude = 1;
  const errors = validateMapRouteResponse(invalid, provider.id, 'map-request-1', request);
  assert.ok(errors.some((error) => error.code === 'request_mismatch'));
  assert.ok(errors.some((error) => error.code === 'coordinate_mismatch'));

  const current = structuredClone(result.response);
  current.validUntil = '2026-09-09T11:00:00.000Z';
  assert.deepEqual(evaluateMapResponsePolicy(current, now), { freshness: 'current', routeAuthoritative: true });
  current.validUntil = '2026-09-09T10:00:00.000Z';
  assert.deepEqual(evaluateMapResponsePolicy(current, now), { freshness: 'expired', routeAuthoritative: false });

  console.log('map provider foundation: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
