import type { AuthChallenge, AuthExternalRedirectChallenge } from './contracts';
import { isSecureAuthorizationUrl } from './runtimeGuards';

export type ExternalAuthNavigation = (url: string) => void;

export function getExternalAuthorizationUrl(challenge: AuthChallenge): string | null {
  if (challenge.kind !== 'external_redirect') return null;
  return isSecureAuthorizationUrl(challenge.redirectUrl) ? challenge.redirectUrl : null;
}

/**
 * Starts browser navigation only for a guarded external_redirect challenge.
 *
 * Production security still depends on the ARVELIS backend constructing the
 * URL from allowlisted provider configuration and validating callback state,
 * PKCE/nonce/issuer/audience as applicable.
 */
export function navigateToExternalAuthorization(
  challenge: AuthExternalRedirectChallenge,
  navigate: ExternalAuthNavigation = (url) => window.location.assign(url),
): boolean {
  const url = getExternalAuthorizationUrl(challenge);
  if (!url) return false;

  navigate(url);
  return true;
}
