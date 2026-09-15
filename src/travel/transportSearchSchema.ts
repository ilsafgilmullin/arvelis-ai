import { TRANSPORT_MODES } from './transportContracts';

const locationProperties = {
  rawLabel: { type: 'string', minLength: 1, maxLength: 160 },
  type: { enum: ['city', 'station', 'airport', 'unknown'] },
  countryCode: { type: 'string', pattern: '^[A-Z]{2}$' },
  region: { type: 'string', minLength: 1, maxLength: 80 },
};
const location = { oneOf: [
  { type: 'object', additionalProperties: false, required: ['rawLabel', 'type', 'resolution'], properties: { ...locationProperties, resolution: { const: 'unresolved' } } },
  { type: 'object', additionalProperties: false, required: ['rawLabel', 'type', 'resolution', 'displayName', 'locationId'], properties: {
    ...locationProperties, type: { enum: ['city', 'station', 'airport'] }, resolution: { const: 'resolved' },
    displayName: { type: 'string', minLength: 1, maxLength: 160 }, locationId: { type: 'string', pattern: '^arvelis:[A-Za-z0-9][A-Za-z0-9._:-]{0,95}$' },
  } },
] };
/** Model-facing structural schema; centralized domain validation also checks clock/relations/ISO currency. */
export const TRANSPORT_SEARCH_REQUEST_V1_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['version', 'origin', 'destination', 'departureDate', 'passengers', 'locale', 'timezone'],
  properties: {
    version: { const: 1 }, origin: location, destination: location,
    departureDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' }, returnDate: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    passengers: { type: 'object', additionalProperties: false, required: ['adults'], properties: { adults: { type: 'integer', minimum: 1, maximum: 9 } } },
    allowedModes: { type: 'array', minItems: 1, maxItems: TRANSPORT_MODES.length, uniqueItems: true, items: { enum: TRANSPORT_MODES } },
    preferredMode: { enum: TRANSPORT_MODES }, locale: { const: 'ru-RU' }, timezone: { type: 'string', minLength: 1, maxLength: 64 },
    preferredCurrency: { type: 'string', pattern: '^[A-Z]{3}$' },
    constraints: { type: 'object', additionalProperties: false, properties: { maxTransfers: { type: 'integer', minimum: 0, maximum: 4 } } },
  },
} as const;
