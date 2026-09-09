# ARVELIS AI — безопасность

**Актуальность:** Yandex Rasp Live Adapter V1 / бесплатная user-facing модель, 2026-09-09.

## Auth / ownership invariants

- OTP verification выполняется trusted server-side;
- raw OTP не хранится и не логируется;
- OTP/session peppers находятся только в protected environment;
- session cookie HttpOnly;
- Account/Session server-authoritative;
- Trip owner определяется из authenticated session;
- client `ownerScopeId` не является authorization credential;
- foreign Trip access fail closed.

## Product monetization boundary

ARVELIS AI сейчас полностью бесплатен для пользователя.

- billing/subscriptions/paywall не проектируются и не подключаются;
- Travel Domain не содержит тарифных/платёжных полей;
- provider usage/cost/quota controls допустимы только как внутренняя backend protection policy;
- смена коммерческой модели в будущем не должна менять `Trip` или normalized Transport contracts.

## Transport data minimization

`TransportSearchRequest` передаёт provider только transport-relevant constraints: Trip ID/revision, traveler count, budget constraint, preference hints и route legs.

Не передаются cookies, session secrets, OTP, traveler identities, документы, payment data, полный Trip aggregate или provider credentials.

## Provider activation security gate

Real transport adapter может быть runtime-enabled только если одновременно подтверждены:

1. актуальная официальная terms review;
2. совместимость условий с `free_public` продуктом;
3. обязательная attribution/branding policy;
4. quota/rate-limit status;
5. cache/storage/processing restrictions;
6. deeplink/booking requirements;
7. server-side credentials availability;
8. secret-safe logging/error behavior;
9. provider output validation;
10. возможность отключить/заменить provider без изменения Travel Domain.

Terms review имеет дату и официальный source URL. Устаревшая review не является основанием для activation.

## Yandex Rasp Live Adapter V1 security boundary

Yandex Rasp реализован как real HTTP adapter, но production activation **не выполнялась**.

### Secrets

Runtime читает только server-side environment:

- `YANDEX_RASP_API_KEY`;
- `YANDEX_RASP_TERMS_RECHECKED_AT`;
- `YANDEX_RASP_QUOTA_CONFIRMED`.

Правила:

- API key никогда не передаётся во frontend;
- key не помещается в Git, PR body, docs, screenshots или logs;
- `.env.example` содержит только пустой placeholder;
- без key provider остаётся disabled;
- без fresh terms timestamp provider остаётся disabled;
- без explicit quota confirmation provider остаётся disabled;
- actual production secret configuration требует отдельного подтверждения пользователя.

### HTTP request safety

`YandexRaspHttpClient`:

- production endpoint допускает только HTTPS approved host `api.rasp.yandex-net.ru`;
- передаёт API key в `Authorization` header;
- не добавляет key в URL/query parameters;
- использует `redirect: error`;
- insecure HTTP endpoint допускается только explicit test mode для local stub;
- network/HTTP/JSON errors санитизированы и не включают secret;
- raw provider response не логируется автоматически.

### Response bounding / parsing

Provider response считается untrusted input.

- point-to-point response ограничен 4 MiB;
- station directory response ограничен 56 MiB;
- JSON shape валидируется до mapping;
- segment/ticket collections bounded;
- malformed numeric/text fields fail closed;
- normalized Transport validation выполняется после adapter mapping.

## Location resolution security / correctness

`stations_list` обрабатывается только server-side.

- exact settlement title match preferred;
- exact station title fallback allowed;
- ambiguous multiple matches возвращают `null`;
- fuzzy guessing отсутствует;
- Yandex codes не записываются в `Trip`;
- отсутствие resolution не заменяется выдуманным code;
- location directory и point resolution cache существуют только в process memory.

## Attribution / truthfulness

Presentation boundary обязан сохранить attribution:

`Данные предоставлены сервисом Яндекс.Расписания`

с provider URL и placement `adjacent_to_data`.

Attribution metadata не является Trip field.

`et_marker` не означает наличие мест и не повышает availability status.

Ticket place price нормализуется как `from`, а не guaranteed final price. Mixed-currency places не конвертируются автоматически.

## Freshness / provenance

Schedule, price и availability нельзя называть authoritative-current без достаточного provider freshness evidence.

- adapter не изобретает `validUntil`;
- missing provider validity остаётся `unspecified`;
- cache TTL не является provider validity;
- `retrievedAt` сохраняет время реального HTTP fetch;
- cache hit не делает старые данные автоматически authoritative;
- `from` price не выдаётся за final quote;
- mixed-currency comparison fail closed;
- AI/model inference не заменяет transport provider fact.

## Temporary cache only

Yandex data хранится только во временной памяти процесса.

Default boundaries:

- search cache TTL: 60 секунд;
- max search entries: 64;
- station directory TTL: 15 минут;
- allowed location TTL bounded максимум 30 минут;
- allowed search TTL bounded максимум 5 минут.

Запрещено сохранять Yandex response/result как постоянную копию в:

- `Trip`;
- SQLite;
- PostgreSQL;
- localStorage;
- filesystem/document archive.

## Orchestration

`TransportOrchestrator` остаётся provider-neutral и обязан:

- проверять ownership до provider call;
- возвращать truthful `not_connected`, если runtime factory вернул `provider: null`;
- применять timeout/cancellation;
- валидировать normalized output;
- не делать silent/mock fallback;
- не выполнять booking/purchase;
- не мутировать Trip автоматически.

## Test credential policy

`test:yandex-rasp-live` использует только fake key внутри test process и local HTTP stub.

Тест обязан доказать:

- key присутствует только в `Authorization`;
- URL не содержит `apikey`/real secret;
- resolver/search работают через real server-side HTTP path;
- `et_marker` остаётся non-availability;
- price semantics = `from`;
- provider validity не выдумывается;
- temporary cache не вызывает лишний повторный provider request;
- runtime without credentials остаётся disabled/not_connected.

CI не выполняет network request к live Yandex API и не требует repository secret.

## Aviasales / other providers boundary

Aviasales Search API в текущий slice не подключается.

Aviasales Data API остаётся только future cached price-insight candidate и не считается live availability source.

Другие provider adapters не подключаются автоматически после Yandex V1.

## CI security

Final Yandex V1 gate:

- `npm audit --audit-level=high`;
- strict project typecheck;
- Provider Foundation regression;
- Yandex HTTP/mapping/freshness stub test;
- existing TransportOrchestrator/Trip ownership regression;
- server runtime build;
- один server-backed Chromium regression;
- frontend build;
- stacked PR PostgreSQL 18.4 lower-layer regression;
- GitHub Actions permissions `contents: read`.

## Production / STOP boundary

Green implementation/PR tests не означают production readiness или live provider activation.

До фактического activation отдельно нужны:

- user-provided/authorized live API credential configuration;
- fresh official terms review;
- quota confirmation for the issued access;
- production network/observability/privacy review;
- UI attribution presentation verification;
- Russia endpoint accessibility check в production topology.

Без отдельного подтверждения не выполняются production wiring, key activation, booking/payment, другие provider adapters, merge в `main` или изменение production secrets.

ARVELIS нельзя называть production-ready до фактического security/privacy/infrastructure/provider-terms audit.
