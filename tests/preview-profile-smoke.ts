import {
  DEFAULT_PREVIEW_PROFILE_NAME,
  isPersistablePreviewProfileName,
  normalizePreviewProfileName,
  resolveStoredPreviewProfileName,
  validatePreviewProfileName,
} from '../src/auth/previewProfile';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

assert(validatePreviewProfileName('Ильсаф') === null, 'valid preview name rejected');
assert(
  normalizePreviewProfileName('  Ильсаф   Г.  ') === 'Ильсаф Г.',
  'ordinary whitespace was not normalized canonically',
);
assert(validatePreviewProfileName('   ') !== null, 'blank preview name accepted');
assert(validatePreviewProfileName('Ильсаф\nГ.') !== null, 'newline in preview name accepted');
assert(validatePreviewProfileName('Ильсаф\tГ.') !== null, 'tab in preview name accepted');
assert(validatePreviewProfileName(`Ильсаф\u200BГ.`) !== null, 'format control character in preview name accepted');
assert(
  validatePreviewProfileName(DEFAULT_PREVIEW_PROFILE_NAME) !== null,
  'reserved system preview name accepted as user name',
);
assert(
  validatePreviewProfileName('A'.repeat(81)) !== null,
  'oversized preview name accepted',
);

assert(
  resolveStoredPreviewProfileName('  Ильсаф   Г.  ') === 'Ильсаф Г.',
  'valid legacy whitespace was not normalized on storage read',
);
assert(
  resolveStoredPreviewProfileName('Ильсаф\nГ.') === DEFAULT_PREVIEW_PROFILE_NAME,
  'corrupt stored control character reached profile state',
);
assert(
  resolveStoredPreviewProfileName(`Ильсаф\u200BГ.`) === DEFAULT_PREVIEW_PROFILE_NAME,
  'corrupt stored format character reached profile state',
);
assert(
  resolveStoredPreviewProfileName(42) === DEFAULT_PREVIEW_PROFILE_NAME,
  'non-string stored profile value did not fail closed',
);
assert(
  resolveStoredPreviewProfileName(DEFAULT_PREVIEW_PROFILE_NAME) === DEFAULT_PREVIEW_PROFILE_NAME,
  'system preview default was not preserved',
);

assert(isPersistablePreviewProfileName('Ильсаф'), 'canonical user preview name rejected for persistence');
assert(
  isPersistablePreviewProfileName(DEFAULT_PREVIEW_PROFILE_NAME),
  'internal default preview name rejected for persistence',
);
assert(!isPersistablePreviewProfileName(' Ильсаф '), 'non-canonical profile name accepted for persistence');
assert(!isPersistablePreviewProfileName('Ильсаф\nГ.'), 'control character accepted for persistence');

console.log('ARVELIS preview profile smoke: PASS');
