# Yandex Rasp Development Preparation V1

Review/preparation date: 2026-09-15. Continues Draft PR #41 on top of
`309bf95d2168d0e1422989697a483da2a634c0cf`.

**This document does not authorize production activation, deployment or merge.**
The live provider and real provider → Qwen path remain unverified until a protected
development credential and reviewed live bindings are available.

## What this preparation adds

1. A server-only trusted binding manifest contract. The checked-in development
   manifest is intentionally empty. No fixture location is promoted to a live binding.
2. A reusable provider-attribution React component and mobile-safe styling. It
   renders validated text/link only; provider HTML is never rendered.
3. A documented protected-development-credential procedure. No credential is stored
   in Git, documentation, frontend variables, CI logs or chat.

## Trusted development bindings

File: `config/yandex-rasp-development-bindings.v1.json`.

The manifest is configuration reviewed by the server side, not user/model input.
`parseYandexRaspTrustedBindingsManifest()` rejects environment mismatch, extra/poison
keys, duplicate ARVELIS IDs/provider search codes, malformed Yandex codes, invalid
station allowlists and non-canonical verification timestamps.

Each future approved entry must contain:

- an existing resolved ARVELIS `locationId` (`arvelis:...`), never a provider code;
- `locationType`: `city`, `station` or `airport`;
- a verified Yandex `searchCode`;
- the exact station allowlist used to validate provider responses;
- a canonical UTC `verifiedAt` timestamp recording when the mapping was checked.

City entries use a `c...` search code and one or more verified `s...` station codes.
Station/airport entries use one `s...` search code and exactly the same single station
code. Test fixtures from the smoke suites are not approved live bindings, even when a
fixture code happens to resemble a real provider code.

Do not populate this manifest by guessing codes from labels. For the first live smoke,
add only the minimum origin/destination pair after independently verifying the provider
codes and city→station membership against Yandex Rasp data/documentation.

## Attribution UI state

`TransportProviderAttribution` is provider-neutral presentation code for
`TransportResultMetadata.attribution`. It:

- keeps attribution immediately attachable to the future provider-backed result block;
- renders only an HTTPS text/link from validated metadata;
- uses normal application font size and inherited text color;
- is mobile-safe and keyboard-focusable;
- never uses `dangerouslySetInnerHTML` or raw `/copyright/` banner markup;
- marks a required banner as `data-banner-state="pending"` until a trusted local
  banner asset/component is supplied.

Therefore `YANDEX_RASP_ATTRIBUTION_IMPLEMENTED` **must remain `false` for now**.
Text/link preparation is complete, but the required safe banner and its final placement
beside every Yandex-backed result have not yet been accepted. The current Routes screen
contains no live provider results, so it intentionally does not show Yandex attribution.

## Development credential procedure

Official references reviewed on 2026-09-15:

- access/key setup: https://yandex.ru/dev/rasp/doc/ru/concepts/access
- API overview: https://yandex.ru/dev/rasp/
- point-to-point request: https://yandex.ru/dev/rasp/doc/ru/reference/schedule-point-point
- terms: https://yandex.ru/legal/timetable_api/ru/

Use a dedicated development key obtained through the Yandex developer flow. Follow the
activation instructions sent for that key. Do not reuse a production credential.

Store the value only in the protected development environment under
`YANDEX_RASP_API_KEY`. For Replit, use its protected Secrets/environment facility; for
a local runtime use an ignored `.env` only when necessary. Never paste the key into
GitHub files, PR text, screenshots, chat, frontend `VITE_*` variables or command-line
arguments that may be retained in history.

Before the key exists, keep:

```text
YANDEX_RASP_API_KEY=<protected secret only; never commit>
YANDEX_RASP_NETWORK_ENABLED=false
YANDEX_RASP_FREE_PUBLIC_CONFIRMED=false
YANDEX_RASP_QUOTA_CONFIRMED=false
YANDEX_RASP_ATTRIBUTION_IMPLEMENTED=false
YANDEX_RASP_OPERATIONAL_POLICY_ACCEPTED=false
```

`YANDEX_RASP_TERMS_RECHECKED_AT` is filled only after a fresh terms review immediately
before an approved live smoke. `YANDEX_RASP_QUOTA_CONFIRMED` stays false until the
actual issued-key limits/operational constraints are confirmed. Application rate limits
in `.env.example` are internal budgets, not a Yandex quota claim.

## Gate to the first bounded live smoke

The first external request is permitted only after all of these are true in the
**development** environment:

- dedicated key has been created, activated and stored as a protected secret;
- the minimum required trusted bindings have been independently reviewed;
- current terms/free-public compatibility has been rechecked;
- actual issued-key quota/limits have been reviewed;
- the safe attribution banner and exact result-adjacent placement are accepted;
- the operational policy for the smoke is accepted;
- network enablement is explicitly approved for the smoke.

Until then the normalized factory must remain disabled and no Yandex network request
should occur. Production activation remains a separate future decision.
