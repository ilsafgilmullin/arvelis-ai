const UNSAFE_TEXT_PATTERN = /\p{C}/u;
const ASCII_LOCAL_PATTERN = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
const DOMAIN_LABEL_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

export const EMAIL_OTP_MAX_EMAIL_LENGTH = 254;
const MAX_LOCAL_PART_LENGTH = 64;

/**
 * Deliberately bounded MVP validator, not a complete RFC 5322 parser.
 *
 * The first server-auth candidate accepts public ASCII mailbox identifiers.
 * Internationalized email support remains a separate compatibility decision.
 * Domain casing is canonicalized; local-part casing is preserved because
 * account uniqueness semantics have not yet been approved.
 *
 * Leading/trailing whitespace is rejected rather than silently normalized at
 * the server trust boundary.
 */
export function normalizeEmailOtpAddress(value: string): string | null {
  if (!value || value.length > EMAIL_OTP_MAX_EMAIL_LENGTH || UNSAFE_TEXT_PATTERN.test(value)) return null;
  if (value.trim() !== value) return null;

  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1 || value.indexOf('@') !== at) return null;

  const local = value.slice(0, at);
  const domain = value.slice(at + 1);
  if (!local || local.length > MAX_LOCAL_PART_LENGTH || !ASCII_LOCAL_PATTERN.test(local)) return null;
  if (local.startsWith('.') || local.endsWith('.') || local.includes('..')) return null;

  const labels = domain.split('.');
  if (labels.length < 2 || labels.some((label) => !DOMAIN_LABEL_PATTERN.test(label))) return null;

  const canonicalDomain = domain.toLowerCase();
  const canonical = `${local}@${canonicalDomain}`;
  return canonical.length <= EMAIL_OTP_MAX_EMAIL_LENGTH ? canonical : null;
}

export function maskEmailOtpAddress(email: string): string {
  const at = email.lastIndexOf('@');
  if (at <= 0) return '***';

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.length <= 2 ? local.slice(0, 1) : local.slice(0, 2);
  return `${visible || '*'}***@${domain}`;
}

export function emailOtpRateIdentity(email: string): string {
  return email.toLowerCase();
}
