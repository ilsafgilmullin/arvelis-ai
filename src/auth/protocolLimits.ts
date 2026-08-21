/**
 * Defensive transport ceilings, not user/product quotas.
 *
 * These values only bound auth protocol payloads at the frontend transport
 * boundary. Product limits belong in separate domain policy and the server
 * must validate every request independently.
 */
export const AUTH_PROTOCOL_LIMITS = {
  methods: 32,
  sessions: 100,
  idLength: 256,
  methodIdLength: 128,
  identifierLength: 512,
  challengeResponseLength: 16_384,
  labelLength: 160,
  displayNameLength: 160,
  emailLength: 320,
  phoneLength: 64,
  deviceLabelLength: 200,
  browserLabelLength: 200,
  maskedDestinationLength: 320,
  redirectUrlLength: 2048,
  failureMessageLength: 2000,
  retryAfterSeconds: 86_400,
} as const;
