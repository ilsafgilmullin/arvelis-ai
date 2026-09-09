# ARVELIS AI — безопасность

**Актуальность:** Transport Provider Strategy & Adapter Foundation V1 / бесплатная user-facing модель, 2026-09-09.

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
4. известные quota/rate-limit условия или explicit fail-closed unknown quota state;
5. cache/storage/processing restrictions;
6. deeplink/booking requirements;
7. server-side credentials availability;
8. secret-safe logging;
9. provider output validation;
10. возможность отключить/заменить provider без изменения Travel Domain.

Terms review имеет дату и официальный source URL. Устаревшая review не является основанием для production activation.

## Yandex Rasp foundation security policy

Yandex Rasp рассматривается как primary schedule candidate, но foundation не активирует live API.

Обязательные ограничения:

- API key только server-side env;
- ключ не попадает во frontend, Git, PR, screenshots, docs или logs;
- без ключа adapter остаётся disabled/not_connected;
- attribution должна сохраняться до UI presentation boundary;
- provider data не сохраняется как постоянная копия в `Trip`;
- разрешён только temporary operational cache;
- `et_marker` не является availability и не может повышать availability status;
- отсутствие provider `validUntil` нельзя заменять выдуманным сроком действия;
- application cache TTL описывает только возраст локального кэша, а не гарантию Яндекса;
- booking/payment отсутствуют.

Перед фактической activation ключа актуальные Yandex terms/attribution/quota должны быть проверены повторно.

## Aviasales boundary

Aviasales Search API сейчас не активируется и не подключается. Его published access/booking/deeplink constraints не соответствуют текущей ранней стратегии ARVELIS без отдельного approval.

Aviasales Data API остаётся только future cached price-insight candidate и не считается live availability source.

## Provider response = untrusted input

Любой normalized Transport response валидируется до использования:

- contract/provider/request identity;
- bounded route/segment counts;
- `legId` принадлежит requested leg;
- unique IDs;
- valid timestamps/HTTPS URL/value shape;
- non-negative safe-integer price;
- explicit price semantics;
- segment chronology;
- no invented availability/freshness.

Malformed provider response fail closed.

## Freshness / provenance

Schedule, price и availability нельзя называть authoritative-current без достаточного provider freshness evidence.

- stale data не выдаётся за current;
- missing provider validity остаётся `unspecified`;
- `from` price не выдаётся за final quote;
- `cached_observation` не выдаётся за live price;
- mixed-currency comparison fail closed;
- AI/model inference не заменяет transport provider fact.

## Orchestration

`TransportOrchestrator` проверяет ownership до provider call, поддерживает timeout/cancellation, валидирует output, не делает silent/mock fallback, не выполняет booking и не мутирует Trip автоматически.

## Audit / secrets

Разрешены минимальные metadata: request ID, Trip ID/revision, provider ID, timestamps/duration, status и validation codes.

Запрещено логировать API keys, provider auth query params/headers, raw response payloads, cookies/session secrets, documents и payment data.

## CI security

- `npm audit --audit-level=high`;
- strict project typecheck;
- Plan/Transport/Provider Foundation business-security tests;
- server runtime build;
- один server-backed Chromium regression;
- PostgreSQL lower-layer regression в stacked PR;
- GitHub Actions permissions `contents: read`;
- self-mutating workflow отсутствует.

## Production / Russia review

До production отдельно проверяются персональные данные, трансграничная передача, retention/deletion/export, consent/legal notices, provider endpoint availability из России, network topology и current provider terms.

ARVELIS нельзя называть production-ready до фактического security/privacy/infrastructure/provider-terms audit.
