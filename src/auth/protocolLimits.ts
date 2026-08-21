/**
 * Defensive transport ceilings, not user/product quotas.
 *
 * These values only bound untrusted auth protocol payloads before they enter
 * application state. Product limits belong in separate domain policy.
 */
export const AUTH_PROTOCOL_LIMITS = {
  methods: 32,
  sessions: 100,
  idLength: 256,
  methodIdLength: 128,
  labelLength: 160,
  displayNameLength: 160,
  emailLength: 320,
  phoneLength: 64,
  deviceLabelLength: 200,
  browserLabelLength: 200,
  maskedDestinationLength: 320,
  redirectUrlLength: 2048,
  failureMessageLength: 2000,
} as const;
