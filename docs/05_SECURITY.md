# ARVELIS AI — безопасность

**Актуальность:** Transport Normalized Route Contract V1 / бесплатная user-facing модель, 2026-09-09.

## Auth / ownership invariants

- OTP verification выполняется trusted server-side;
- raw OTP не хранится и не логируется;
- OTP/session peppers находятся только в protected environment;
- session cookie HttpOnly;
- Account/Session server-authoritative;
- Trip owner определяется из authenticated session;
- client `ownerScopeId` не является authorization credential;
- foreign Trip access fail closed.

## Trip persistence boundary

Server-side Trip API V1 account-scoped. SQLite используется для development/closed test, PostgreSQL adapter проверяется regression gate. Production DB/region/backups/retention остаются отдельным решением.

## Product monetization boundary

На текущем этапе ARVELIS AI — полностью бесплатный пользовательский сервис.

- billing, subscriptions и paywall не проектируются и не подключаются;
- Travel Domain не должен содержать тарифные/платёжные поля;
- provider usage/cost controls допустимы только как внутренняя эксплуатационная защита backend;
- выбор внешнего provider не должен делать бесплатность пользователя частью domain contract;
- возможность будущего изменения коммерческой модели должна решаться вне `Trip`/Transport domain, отдельным application/access layer.

## Plan data minimization

Будущий AI/provider не получает raw Trip aggregate автоматически. `PlanRequest` содержит только необходимые planning constraints. Session secrets, OTP, документы, банковские данные, live location, database credentials и provider keys не передаются.

## Transport data minimization

`TransportSearchRequest` передаёт transport provider только данные, необходимые для поиска:

- Trip ID/revision;
- traveler count;
- budget limit как constraint;
- transport preference hints;
- origin/destination/date для legs.

Не передаются cookies, session secrets, traveler identity labels, документы, payment details или полный Trip aggregate.

## Provider response = untrusted input

Transport provider response проходит deterministic validation до использования:

- contract/provider/request identity;
- bounded route/segment counts;
- unique IDs;
- valid timestamps/HTTPS URL/value shape;
- non-negative safe-integer price minor units;
- segment chronology;
- validity deadline not before retrieval time.

Malformed provider response fail closed.

## Freshness / authoritative transport facts

Schedule, price и availability считаются authoritative-current только если route имеет explicit `validUntil`, который не истёк.

- stale route не выдаётся за текущий;
- route без freshness bound получает `unspecified`;
- mixed-currency price comparison fail closed;
- автоматический FX conversion не выполняется без отдельного Currency contract/provider;
- AI/model inference не заменяет transport provider fact.

## Provider orchestration

`TransportOrchestrator` обязан:

- проверить account scope/Trip ownership до provider call;
- вернуть честный `not_connected`, если adapter отсутствует;
- применять bounded timeout и caller cancellation;
- валидировать output до use;
- не делать silent/mock fallback;
- не выполнять booking/purchase;
- не мутировать Trip автоматически.

## Audit minimization

Разрешены только минимальные технические metadata: request ID, Trip ID/revision, provider ID, timestamps/duration, status и validation codes.

Не логируются route response body, user documents, cookies/session secrets, provider API keys, payment information и полный пользовательский prompt/context.

## External provider terms gate

Перед реальным подключением **каждого** transport API обязательна отдельная проверка актуальных официальных условий:

1. разрешённый тип проекта и география;
2. attribution/branding requirements;
3. quotas/rate limits;
4. правила caching/storage/processing;
5. deeplink/booking/affiliate requirements;
6. право показывать price/availability;
7. требования к бесплатному/платному пользовательскому доступу;
8. credentials/security handling;
9. изменение условий/termination risk;
10. возможность замены provider без изменения Travel Domain.

Проверка должна фиксироваться датой и ссылками на официальные источники. Неофициальный reverse-engineered API не является production provider strategy.

## Secrets

Все реальные transport/API credentials — только server-side protected environment. Frontend не получает vendor keys. Ключи не помещаются в GitHub, docs, screenshots или пользовательские ответы.

## CI security

- `npm audit --audit-level=high` обязателен;
- project typecheck обязателен;
- Plan/Transport business-security smoke проверяют ownership, validation, timeout/cancellation и truthful not-connected states;
- GitHub Actions permissions остаются `contents: read`;
- self-mutating workflow отсутствует.

## Production / Russia review

До public production rollout отдельно проверяются персональные данные, трансграничная передача provider-ам, retention/deletion/export, consent/legal notices и фактическая доступность выбранных provider endpoints из России без обязательного VPN там, где это продуктово требуется.

ARVELIS нельзя называть production-ready до фактического security/privacy/infrastructure/provider-terms audit.
