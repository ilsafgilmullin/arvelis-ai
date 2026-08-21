const UNSAFE_PROTOCOL_CHARACTER_PATTERN = /\p{C}/u;

/**
 * Rejects Unicode control/format/surrogate/private-use/unassigned code points
 * at the auth protocol boundary. In particular this blocks bidi overrides and
 * zero-width format controls that can make security-sensitive UI text render
 * differently from the underlying payload.
 */
export function containsUnsafeProtocolCharacters(value: string): boolean {
  return UNSAFE_PROTOCOL_CHARACTER_PATTERN.test(value);
}
