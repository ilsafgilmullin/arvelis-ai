import { transportLocalDate, type TransportSearchRequestV1 } from '../../../src/travel/transportSearchRequest';

/** Test/evaluation only; invented directory identities are explicitly synthetic. No runtime special case. */
export function syntheticTransportSearch(now: Date): TransportSearchRequestV1 {
  return {
    version: 1,
    origin: { resolution: 'resolved', type: 'city', rawLabel: 'Synthetic Origin', displayName: 'Synthetic Origin', locationId: 'arvelis:synthetic-origin' },
    destination: { resolution: 'resolved', type: 'city', rawLabel: 'Synthetic Destination', displayName: 'Synthetic Destination', locationId: 'arvelis:synthetic-destination' },
    departureDate: transportLocalDate(new Date(now.getTime() + 7 * 86_400_000), 'Europe/Moscow'),
    passengers: { adults: 1 }, allowedModes: ['train'], locale: 'ru-RU', timezone: 'Europe/Moscow', preferredCurrency: 'RUB', constraints: { maxTransfers: 0 },
  };
}
