export type TransportProductAccessModel = 'free_public' | 'paid_or_restricted';

export type TransportProviderStrategyStatus =
  | 'foundation_candidate'
  | 'deferred_insight_source'
  | 'deferred_supporting_source'
  | 'blocked_until_scale_requirement';

export type TransportProviderProductCompatibility =
  | 'free_public_only'
  | 'partner_terms_review_required'
  | 'access_model_neutral';

export type TransportProviderStoragePolicy =
  | 'temporary_cache_only'
  | 'provider_terms_review_required'
  | 'unknown';

export type TransportProviderDeeplinkPolicy =
  | 'attribution_only_no_booking'
  | 'user_initiated_booking_required'
  | 'provider_terms_review_required'
  | 'none';

export type TransportProviderQuotaPolicy = {
  verificationRequiredBeforeActivation: boolean;
  publishedLimit: string | null;
};

export type TransportProviderAttributionPolicy = {
  required: boolean;
  text?: string;
  url?: string;
  placement?: 'adjacent_to_data' | 'provider_terms';
};

export type TransportProviderDescriptor = {
  id: string;
  displayName: string;
  strategyStatus: TransportProviderStrategyStatus;
  productCompatibility: TransportProviderProductCompatibility;
  supportedNormalizedModes: readonly string[];
  capabilities: {
    schedule: boolean;
    price: boolean;
    liveAvailability: boolean;
    booking: boolean;
  };
  attribution: TransportProviderAttributionPolicy;
  storagePolicy: TransportProviderStoragePolicy;
  deeplinkPolicy: TransportProviderDeeplinkPolicy;
  quota: TransportProviderQuotaPolicy;
  minimumMau?: number;
  termsReviewedAt: string;
  officialTermsUrls: readonly string[];
  notes: readonly string[];
};

export type TransportProviderActivationContext = {
  productAccessModel: TransportProductAccessModel;
  termsRecheckedAt: string;
  credentialsConfigured: boolean;
  quotaConfirmed: boolean;
  monthlyActiveUsers?: number;
  userInitiatedBookingFlowApproved: boolean;
};

export type TransportProviderActivationBlocker =
  | 'strategy_not_selected_for_live_adapter'
  | 'product_access_incompatible'
  | 'terms_review_stale'
  | 'credentials_missing'
  | 'quota_unconfirmed'
  | 'minimum_mau_not_met'
  | 'booking_flow_not_approved';

export type TransportProviderActivationDecision = {
  eligible: boolean;
  blockers: TransportProviderActivationBlocker[];
};

const MAX_TERMS_REVIEW_AGE_MS = 24 * 60 * 60 * 1_000;

export const YANDEX_RASP_V3_DESCRIPTOR: TransportProviderDescriptor = {
  id: 'yandex-rasp-v3',
  displayName: 'Яндекс Расписания API v3',
  strategyStatus: 'foundation_candidate',
  productCompatibility: 'free_public_only',
  supportedNormalizedModes: ['flight', 'train', 'suburbanRail', 'bus', 'ferry', 'other'],
  capabilities: {
    schedule: true,
    price: true,
    liveAvailability: false,
    booking: false,
  },
  attribution: {
    required: true,
    text: 'Данные предоставлены сервисом Яндекс.Расписания',
    url: 'https://rasp.yandex.ru/',
    placement: 'adjacent_to_data',
  },
  storagePolicy: 'temporary_cache_only',
  deeplinkPolicy: 'attribution_only_no_booking',
  quota: {
    verificationRequiredBeforeActivation: true,
    publishedLimit: null,
  },
  termsReviewedAt: '2026-09-09T08:00:00.000Z',
  officialTermsUrls: [
    'https://yandex.ru/legal/timetable_api/ru/',
    'https://yandex.ru/dev/rasp/doc/ru/',
    'https://yandex.ru/dev/rasp/doc/ru/concepts/access',
    'https://yandex.ru/dev/rasp/doc/ru/reference/query-copyright',
    'https://yandex.ru/dev/rasp/doc/ru/reference/schedule-point-point',
  ],
  notes: [
    'Use is compatible only with a free publicly accessible product under the reviewed terms.',
    'Raw or normalized provider data must not become long-lived Trip persistence; only temporary cache permitted by reviewed terms.',
    'No numeric public quota was confirmed in the reviewed public documentation; issued-key quota must be confirmed before activation.',
    'Electronic-ticket marker is not seat availability and must not be mapped to available.',
  ],
};

export const AVIASALES_DATA_API_DESCRIPTOR: TransportProviderDescriptor = {
  id: 'aviasales-data-api',
  displayName: 'Aviasales Data API',
  strategyStatus: 'deferred_insight_source',
  productCompatibility: 'partner_terms_review_required',
  supportedNormalizedModes: ['flight'],
  capabilities: {
    schedule: false,
    price: true,
    liveAvailability: false,
    booking: false,
  },
  attribution: { required: false, placement: 'provider_terms' },
  storagePolicy: 'provider_terms_review_required',
  deeplinkPolicy: 'provider_terms_review_required',
  quota: {
    verificationRequiredBeforeActivation: true,
    publishedLimit: 'method-specific',
  },
  termsReviewedAt: '2026-09-09T08:00:00.000Z',
  officialTermsUrls: [
    'https://support.travelpayouts.com/hc/ru/articles/203956083-Условия-предоставления-доступа-к-API-данных-от-Aviasales',
    'https://support.travelpayouts.com/hc/ru/articles/203956163-API-данных-Aviasales-для-партнёров',
  ],
  notes: [
    'Cached price insights are not a live availability/search source.',
    'Use as a future aviation insight source only after a fresh partner-terms and quota review.',
  ],
};

export const AVIASALES_SEARCH_API_DESCRIPTOR: TransportProviderDescriptor = {
  id: 'aviasales-search-api',
  displayName: 'Aviasales Flight Search API',
  strategyStatus: 'blocked_until_scale_requirement',
  productCompatibility: 'partner_terms_review_required',
  supportedNormalizedModes: ['flight'],
  capabilities: {
    schedule: true,
    price: true,
    liveAvailability: true,
    booking: false,
  },
  attribution: { required: false, placement: 'provider_terms' },
  storagePolicy: 'provider_terms_review_required',
  deeplinkPolicy: 'user_initiated_booking_required',
  quota: {
    verificationRequiredBeforeActivation: true,
    publishedLimit: '100 requests/hour per user IP by default in current Search API documentation',
  },
  minimumMau: 50_000,
  termsReviewedAt: '2026-09-09T08:00:00.000Z',
  officialTermsUrls: [
    'https://support.travelpayouts.com/hc/ru/articles/210995808-Как-получить-доступ-к-API-поиска-билетов-Aviasales',
    'https://support.travelpayouts.com/hc/ru/articles/30565016140434-API-Авиасейлс-для-поиска-авиабилетов-сложные-маршруты-и-поиск-в-реальном-времени',
    'https://support.travelpayouts.com/hc/en-us/articles/34788165535250-Search-API-usage-rules',
  ],
  notes: [
    'Current access requires confirmed 50,000+ MAU.',
    'Search must be user initiated and the current rules require a booking button/deeplink flow after the user click.',
    'Not suitable as the first ARVELIS live adapter at the current product stage.',
  ],
};

export const TUTU_SCHEDULE_DESCRIPTOR: TransportProviderDescriptor = {
  id: 'tutu-schedule-data',
  displayName: 'Tutu schedule data',
  strategyStatus: 'deferred_supporting_source',
  productCompatibility: 'partner_terms_review_required',
  supportedNormalizedModes: ['train', 'bus'],
  capabilities: {
    schedule: true,
    price: false,
    liveAvailability: false,
    booking: false,
  },
  attribution: { required: false, placement: 'provider_terms' },
  storagePolicy: 'provider_terms_review_required',
  deeplinkPolicy: 'provider_terms_review_required',
  quota: {
    verificationRequiredBeforeActivation: true,
    publishedLimit: null,
  },
  termsReviewedAt: '2026-09-09T08:00:00.000Z',
  officialTermsUrls: [
    'https://support.travelpayouts.com/hc/ru/articles/20384016664594-Бренды-предоставляющие-доступ-к-API-и-фидам-данных-для-партнёров-Travelpayouts',
  ],
  notes: [
    'Current Travelpayouts documentation describes schedule/table data and explicitly says it is not real-time price data for search forms.',
    'Keep as a supporting schedule-data candidate, not a live-price provider.',
  ],
};

export const TRANSPORT_PROVIDER_STRATEGY = [
  YANDEX_RASP_V3_DESCRIPTOR,
  AVIASALES_DATA_API_DESCRIPTOR,
  AVIASALES_SEARCH_API_DESCRIPTOR,
  TUTU_SCHEDULE_DESCRIPTOR,
] as const;

function isValidReviewTimestamp(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

export function evaluateTransportProviderActivation(
  descriptor: TransportProviderDescriptor,
  context: TransportProviderActivationContext,
  now = new Date(),
): TransportProviderActivationDecision {
  const blockers: TransportProviderActivationBlocker[] = [];

  if (descriptor.strategyStatus !== 'foundation_candidate') {
    blockers.push('strategy_not_selected_for_live_adapter');
  }
  if (descriptor.productCompatibility === 'free_public_only' && context.productAccessModel !== 'free_public') {
    blockers.push('product_access_incompatible');
  }

  const reviewedAt = Date.parse(context.termsRecheckedAt);
  if (!isValidReviewTimestamp(context.termsRecheckedAt) || Math.abs(now.getTime() - reviewedAt) > MAX_TERMS_REVIEW_AGE_MS) {
    blockers.push('terms_review_stale');
  }
  if (!context.credentialsConfigured) blockers.push('credentials_missing');
  if (descriptor.quota.verificationRequiredBeforeActivation && !context.quotaConfirmed) blockers.push('quota_unconfirmed');

  if (descriptor.minimumMau !== undefined && (context.monthlyActiveUsers ?? 0) < descriptor.minimumMau) {
    blockers.push('minimum_mau_not_met');
  }
  if (descriptor.deeplinkPolicy === 'user_initiated_booking_required' && !context.userInitiatedBookingFlowApproved) {
    blockers.push('booking_flow_not_approved');
  }

  return { eligible: blockers.length === 0, blockers };
}
