# ARVELIS AI — Auth Core Boundary

Дата: 2026-08-21.
Статус: `TECHNICAL BOUNDARY DECISION / PROVIDER OPEN`.

Этот документ фиксирует архитектурную границу авторизации. Он **не утверждает** Keycloak, конкретную БД, email/phone/OTP/passkey или внешний identity provider.

## Решение

ARVELIS AI владеет собственной семантикой:

- `Account`;
- `Identity link`;
- `Session`;
- account lifecycle;
- security events;
- authorization/access policy.

Конкретный identity engine и внешние IdP находятся **за заменяемой границей**.

Браузер не строится вокруг SDK одного provider и не использует provider access token как собственную ARVELIS session.

Целевой поток:

`ARVELIS Web/App → ARVELIS BFF/Auth API → Auth Core / Identity Adapter → External IdP`

Frontend-контракт:

`AuthTransport (untrusted payloads) → guardedGateway → AuthGateway → auth controller/UI`.

## Почему это фиксируется сейчас

Без этой границы раннее подключение удобного OAuth/Firebase/Auth0-подобного SDK легко превращает внешний provider id/token в фактическую модель аккаунта продукта.

Это создаёт:

- vendor lock-in;
- сложную миграцию account ids;
- внешний single point of failure;
- смешивание authentication и authorization;
- риск хранения provider/session credentials в browser storage;
- проблемы с будущим ARVELIS CONTROL;
- проблемы при изменении требований к инфраструктуре и локализации данных.

## Trust boundaries

### 1. Browser / mobile client — недоверенная среда

Клиент может:

- отображать формы;
- отправлять пользовательский ввод;
- хранить только разрешённое локальное UX-state;
- инициировать auth flow;
- отображать UI-safe account/session summary.

Клиент **не может быть источником истины** для:

- account id;
- verified identity;
- role/permission;
- session validity;
- owner/admin status;
- challenge attempt count;
- rate limits;
- provider token validity.

### 2. ARVELIS BFF/Auth API — доверенная product boundary

Backend отвечает за:

- нормализацию запросов;
- session cookie lifecycle;
- CSRF strategy по итоговой topology;
- anti-enumeration;
- rate limiting/abuse controls;
- provider adapter orchestration;
- UI-safe error mapping;
- account/identity linking policy;
- security event creation;
- authorization decisions либо передачу в отдельный policy layer.

### 3. Identity engine — заменяемый security component

Candidate A: self-hosted identity core.

Candidate B: app-native auth module с тщательно выбранными зрелыми библиотеками/протоколами.

Оба варианта обязаны удовлетворять одному ARVELIS contract. Frontend не должен знать, какой вариант используется внутри.

### 4. External IdP — источник подтверждения identity, не ARVELIS session

Yandex ID / VK ID / Apple / Google / другие providers:

- могут подтвердить identity согласно выбранному flow/scopes;
- не определяют внутренний ARVELIS Account ID;
- не определяют пользовательские роли;
- их access/refresh token не становится browser session ARVELIS;
- provider tokens, если нужны, обрабатываются server-side согласно отдельной policy.

## Runtime validation boundary

`src/auth/runtimeGuards.ts` и `src/auth/guardedGateway.ts` фиксируют правило:

- network/provider JSON начинается как `unknown`;
- TypeScript interface сам по себе не делает payload доверенным;
- method/session/challenge/failure payload проходит runtime validation;
- duplicate ids и malformed protocol responses fail closed;
- authorization redirect должен быть абсолютным HTTPS URL;
- raw invalid payload не попадает в application state как валидный объект.

Это foundation, не реальный HTTP adapter.

## Session restore resilience

Session restore и method catalog — разные операции.

Правило:

- временный сбой списка способов входа **не инвалидирует существующую валидную ARVELIS session**;
- failure restore session обрабатывается отдельно;
- method catalog можно retry независимо;
- device/session list можно retry независимо;
- session expiry переводит UI в явный `session_expired`, а не в случайный generic error.

Это реализовано в provider-independent controller foundation.

## External OAuth/OIDC flow requirements

До подключения первого external provider обязательны:

1. Authorization Code flow; PKCE там, где он применим/обязателен.
2. `state` генерируется и проверяется доверенным auth layer.
3. OIDC `nonce` используется и проверяется, когда protocol/flow этого требует.
4. Redirect URI регистрируется точно, без wildcard там, где это возможно.
5. Произвольный пользовательский `returnTo` не становится открытым redirect.
6. Authorization code обрабатывается server-side/BFF согласно выбранной topology.
7. Provider client secret/private key не попадает в frontend bundle.
8. Provider tokens не логируются в application logs.
9. Requested scopes минимальны.
10. Account linking не делается только по непроверенному display email.
11. Callback/challenge имеет TTL и replay protection.
12. Ошибки наружу нормализуются в ARVELIS error contract.

## Redirect policy

Frontend runtime guard допускает для `external_redirect` только абсолютный HTTPS authorization URL.

Production backend дополнительно обязан иметь server-side allowlist/registered provider configuration. Клиентская HTTPS-проверка **не заменяет** server allowlist.

Нельзя:

- `javascript:`;
- `data:`;
- произвольный HTTP authorization endpoint;
- redirect на URL из непроверенного user input;
- callback URL, формируемый прямой конкатенацией пользовательских параметров.

## Web session candidate

До final topology остаётся candidate:

- server session;
- browser cookie `HttpOnly`;
- `Secure`;
- `SameSite` выбирается по фактической origin topology;
- session rotation;
- bounded TTL;
- server revoke;
- revoke-all / revoke-others после отдельной security policy;
- critical account changes требуют re-auth/step-up там, где это будет утверждено.

Frontend не хранит long-lived bearer credential в `localStorage`.

## CSRF

Нельзя зафиксировать exact CSRF implementation до final same-origin/cross-origin topology.

Обязательный принцип:

- cookie-authenticated state-changing endpoints имеют CSRF protection, совместимую с выбранной topology;
- CORS не рассматривается как замена CSRF protection;
- sensitive endpoints дополнительно проверяют Origin/Fetch Metadata там, где это применимо;
- auth callback endpoints проектируются отдельно от обычных mutation endpoints.

## Account linking

Самая опасная зона multi-provider auth.

До production linking policy должна ответить:

- когда две identities считаются одним Account;
- нужна ли re-auth существующей identity;
- допустим ли linking по verified email и при каких условиях;
- что происходит при conflicting providers;
- как unlink не оставляет аккаунт без способа восстановления;
- какие security events создаются;
- какие active sessions нужно rotate/revoke.

Автоматическое объединение аккаунтов только по строке email запрещено как базовое допущение.

## Recovery

Recovery не реализуется как обход authentication policy.

Минимальные требования:

- отдельный challenge lifecycle;
- generic enumeration-resistant response;
- rate/attempt limits;
- single-use token/code;
- short TTL;
- security event;
- session rotation/revoke после критического recovery согласно утверждённой policy;
- невозможность получить owner/admin доступ через обычный user recovery flow.

## ARVELIS CONTROL

CONTROL — другой security boundary.

Обычная authenticated user-session ARVELIS AI не является достаточным административным credential.

CONTROL требует отдельно:

- owner/admin identity policy;
- server-side RBAC/permissions;
- stronger authentication/step-up для опасных действий;
- audit;
- session/device revoke;
- отдельную origin/deployment policy до production;
- отсутствие production secrets в control frontend.

Identity engine физически может быть общим компонентом, но realms/clients/policies и authorization boundary не должны смешиваться.

## Россия / инфраструктура

Техническая граница специально позволяет разместить product-owned account/session storage в инфраструктуре, выбранной после legal/security review для требований РФ.

External IdP остаётся adapter, поэтому смена provider не требует смены ARVELIS Account ID.

До реального запуска остаются обязательными:

- data-flow map;
- перечень персональных данных;
- storage/processing regions;
- external provider transfers;
- retention/delete/export policy;
- отдельное юридическое заключение.

## Failure policy

Fail closed для:

- malformed session/challenge payload;
- duplicate protocol ids;
- unsafe external authorization URL;
- invalid authorization/role data;
- expired/replayed challenge на сервере;
- unknown critical security state.

Fail gracefully для:

- недоступного method catalog при уже валидной session;
- недоступного device/session list;
- offline UI;
- временной provider недоступности, если есть другой разрешённый способ входа.

## Что зафиксировано этим решением

- ARVELIS Account ID внутренний и provider-independent;
- ARVELIS session принадлежит продуктовой backend boundary;
- внешний IdP — adapter/identity proof source;
- frontend использует `AuthGateway`, а raw transport проходит runtime guard;
- session restore не зависит от method catalog;
- CONTROL security boundary отдельная.

## Что остаётся OPEN

- Keycloak / другой self-hosted identity core / app-native auth implementation;
- основной user identifier;
- password / OTP / magic link / passkey;
- список providers первого релиза;
- backend framework;
- database;
- hosting;
- exact cookie/CSRF topology;
- exact rate limits;
- recovery implementation;
- production roles/permissions;
- CONTROL owner authentication method.

## Gate перед backend implementation

Нельзя начинать real auth integration, пока отдельно не подтверждены минимум:

1. основной auth method первого релиза;
2. identity-core implementation candidate;
3. backend/API topology;
4. production data store/region candidate;
5. privacy/localization data-flow review;
6. session/cookie/CSRF model;
7. recovery policy;
8. anti-abuse baseline;
9. user vs CONTROL boundary;
10. rollback/disable-provider plan.
