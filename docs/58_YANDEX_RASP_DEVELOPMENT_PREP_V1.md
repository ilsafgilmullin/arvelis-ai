# Yandex Rasp Development Preparation V1

Review/preparation date: 2026-09-15. Continues Draft PR #41 on top of
`309bf95d2168d0e1422989697a483da2a634c0cf`.

**This document does not authorize production activation, deployment or merge.**
The provider implementation remains fail-closed in the application. A private, explicit
development smoke is prepared separately so the issued development key and reviewed
bindings can be verified without enabling the product provider.

## Current development credential state

The dedicated Yandex Rasp key has been created and activated in the Yandex developer
cabinet and stored by the project owner only as the protected Replit secret
`YANDEX_RASP_API_KEY`. The secret value is not present in Git, PR text, documentation,
frontend variables, CI logs or chat.

The issued-key cabinet shows a tariff of **up to 500 requests per day**. This is the
observed development-key quota checkpoint, not a permanent API guarantee; Yandex may
change limits under the current terms.

## Trusted development bindings

File: `config/yandex-rasp-development-bindings.v1.json`.

The manifest is server-controlled development configuration, never user/model input.
`parseYandexRaspTrustedBindingsManifest()` rejects environment mismatch, extra/poison
keys, duplicate ARVELIS IDs/provider search codes, malformed Yandex codes, invalid
station allowlists and non-canonical verification timestamps.

The first private smoke uses only two station-level development identities:

- `arvelis:dev:station:moscow-kazansky` → `s2000003` (Казанский вокзал, Москва);
- `arvelis:dev:station:kazan-pass` → `s9623141` (Казань-Пасс.).

These mappings were independently checked on 2026-09-15 against the official Yandex
Rasp public station pages. The API documentation states that a public station URL of the
form `/station/<id>` maps to the Yandex API station code `s<id>`. The identities above
are development-smoke identities only; they are not promoted to a production location
directory and must not be used to infer other provider codes.

## Attribution and current terms

Official references rechecked on 2026-09-15:

- access/key setup: https://yandex.ru/dev/rasp/doc/ru/concepts/access
- API overview: https://yandex.ru/dev/rasp/
- point-to-point request: https://yandex.ru/dev/rasp/doc/ru/reference/schedule-point-point
- copyright endpoint: https://yandex.ru/dev/rasp/doc/ru/reference/query-copyright
- API terms: https://yandex.ru/legal/timetable_api/ru/

The current `/copyright/` documentation requires the provider material to sit immediately
above or below the Yandex-backed schedule data and specifies the order: banner,
notification text, then the Yandex Rasp URL. The current API terms also require the
source indication to remain visible and not be hidden or modified.

`TransportProviderAttribution` continues to provide provider-neutral text/link
presentation without raw provider HTML and without `dangerouslySetInnerHTML`.
The attribution foundation now also includes `YandexRaspCopyrightBanner` and
`YandexRaspProviderAttribution`:

- the banner uses the official documented provider-hosted monochrome vertical banner
  endpoint `https://yandex.st/rasp/media/apicc/copyright_vert_mono.html`;
- no provider iframe markup returned by `/copyright/` is injected into the DOM;
- the iframe is sandboxed, non-focusable, lazy-loaded and sends no referrer;
- the Yandex-specific wrapper supplies the banner only when the reviewed provider name,
  canonical `https://rasp.yandex.ru/` link and `bannerRequired` metadata still match;
- mobile CSS caps the banner to the available width and prevents horizontal overflow;
- deterministic CI checks lock the banner URL and prohibit `dangerouslySetInnerHTML`
  and `srcDoc` regressions.

This completes the **safe banner presentation primitive**, but not the final product
placement. The current Travel UI still has no user-facing Yandex-backed result surface,
so there is nowhere truthful to attach the mandatory attribution adjacent to live data.
Therefore:

`YANDEX_RASP_ATTRIBUTION_IMPLEMENTED=false`

must remain false. No user-facing Yandex data may be activated before the real result
surface uses `YandexRaspProviderAttribution` directly above or below every Yandex-backed
result block and that placement is browser-tested.

The current API terms allow use only in products available for free open use to an
unlimited audience; registration itself is not treated as restricted access. ARVELIS is
currently specified as a free service, but production activation still requires a fresh
terms/product review. Persistent storage of provider data is not introduced; the current
adapter uses only bounded transient retrieval/freshness behavior.

## Private development smoke boundary

A private manual smoke is deliberately separated from application provider activation.
It exists only to verify:

1. the protected development credential works against the official API host;
2. `/copyright/` returns validated attribution metadata;
3. the two reviewed station bindings are accepted by a single bounded point-to-point
   train request;
4. the returned page passes the existing strict response validator;
5. the key is not printed or included in the sanitized result.

The command is **not** part of `npm run check` and is never run by ordinary CI. It
requires the explicit one-run acknowledgement environment value
`ARVELIS_YANDEX_DEV_SMOKE_APPROVED=true`. It also refuses to run if `NODE_ENV=production`
or if the application-wide `YANDEX_RASP_NETWORK_ENABLED` gate is already true.

The smoke issues at most two external requests: one `/copyright/` request and one
`/search/` request. It uses `Authorization`, the fixed HTTPS Yandex host, redirect
rejection, `cache: no-store`, the existing 10 second HTTP timeout and the existing
bounded response reader. Its output is sanitized and does not include raw response data
or the credential.

This private smoke does **not** set or imply any of the product activation flags below:

```text
YANDEX_RASP_NETWORK_ENABLED=false
YANDEX_RASP_FREE_PUBLIC_CONFIRMED=false
YANDEX_RASP_QUOTA_CONFIRMED=false
YANDEX_RASP_ATTRIBUTION_IMPLEMENTED=false
YANDEX_RASP_OPERATIONAL_POLICY_ACCEPTED=false
```

`YANDEX_RASP_TERMS_RECHECKED_AT` also remains an application activation gate rather than
a requirement for this isolated credential/binding verification.

## Automation boundary

The protected development credential currently exists only inside the user's Replit
secret store. GitHub Actions intentionally has no copy of that secret and ordinary CI
must remain credential-free. This means repository-side automation can prepare, compile
and test the live-smoke path, but cannot truthfully execute the external Yandex request
unless the credential becomes available to that runtime through a separately approved
protected-secret channel.

No Replit Agent is required or used by this preparation. Production deployment,
production secret changes and merge remain separately prohibited without explicit
approval.

## Next gates

After the private smoke succeeds:

1. inspect the sanitized result and any strict-response mismatch before changing code;
2. attach `YandexRaspProviderAttribution` directly to the first real provider-backed
   result surface and browser-test the adjacent placement;
3. record the current free-public/quota/operational decisions in the development
   activation policy without changing production secrets;
4. only then run a bounded normalized provider live verification;
5. keep real provider → AiGateway → Qwen E2E as a separate gate;
6. keep production activation and merge separate and explicitly approved.

No real provider request has been claimed as completed by this document. Production
activation remains off until the later gates are actually verified.
