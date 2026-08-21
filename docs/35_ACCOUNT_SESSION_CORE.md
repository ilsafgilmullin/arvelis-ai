# ARVELIS AI — Account / Identity / Session Core

Дата: 2026-08-21.
Статус: **server foundation candidate**.
Ветка: `feat/account-session-core-v1`.
Base: `feat/email-otp-auth-core-v1` / PR №18.

## Цель

Создать следующую доверенную auth-границу после подтверждения email:

`Verified Email → Account / Identity → Server Session`

При этом не фиксировать раньше времени:

- production database;
- backend framework;
- cookie format/topology;
- user-facing sign_up/sign_in conflict policy;
- retention periods;
- roles/permissions;
- CONTROL admin realm.

## Account / Identity contracts

Добавлен:

`server/auth/account/contracts.ts`

### Account

`AccountRecord` имеет собственный immutable id и не использует email как primary key.

Минимальный auth-state:

- `status`;
- `securityVersion`;
- created/updated timestamps.

Статусы candidate-модели:

- `active`;
- `suspended`;
- `pending_deletion`;
- `deleted`.

### Email Identity

Первый identity kind:

`email_otp`

Identity хранит:

- собственный identity id;
- account id;
- canonical email;
- verification/link timestamps;
- last authenticated timestamp;
- disabled state.

Email не становится вечным Account id.

### Atomic account + identity creation

`AccountIdentityStore.createAccountWithEmailIdentity()` обязан быть атомарным на production persistence layer.

При уже существующем email store возвращает explicit `email_conflict`.

**Важно:** этот server contract не решает пользовательскую политику конфликта.

Например, пока не утверждено:

- должна ли `Регистрация` с уже существующим verified email автоматически входить;
- должна ли она показывать `Аккаунт уже существует`;
- должен ли `Вход` с новым verified email предлагать создать аккаунт.

Эта policy остаётся отдельным product decision.

## Session Core

Добавлен отдельный server-domain:

`server/auth/session/`

Компоненты:

- `contracts.ts`;
- `policy.ts`;
- `webCryptoSecurity.ts`;
- `service.ts`.

## Session credential model

Server session использует две части:

- 128-bit random session id;
- 256-bit random opaque secret.

Persistence **не хранит raw secret**.

В `SessionRecord` сохраняется HMAC-SHA-256, domain-separated по session id + secret.

Raw secret существует только в internal `IssuedServerSession` и предназначен для будущего trusted HTTP/BFF adapter, который установит защищённый browser cookie.

Raw secret:

- не является frontend API data model;
- не хранится в localStorage;
- не должен логироваться;
- не должен попадать в analytics;
- не должен возвращаться обычному React application state.

## WebCrypto

`WebCryptoSessionSecurity` использует:

- `crypto.getRandomValues()`;
- HMAC-SHA-256;
- `crypto.subtle.verify()`;
- server pepper минимум 32 bytes.

Pepper должен поступать только из protected environment / secret manager.

## Session authentication

`SessionService.authenticate()` проверяет:

1. canonical session id/secret format;
2. session record exists and is structurally valid;
3. session not revoked;
4. expiry;
5. cryptographic secret verification;
6. Account still exists;
7. Account status = `active`;
8. Account `securityVersion` совпадает с версией session.

Если Account suspended/deleted/unavailable — authentication fail closed.

Если `securityVersion` изменился — старая session становится недействительной.

Это позволяет будущему account-security layer инвалидировать старые session после критического изменения без зависимости от frontend state.

## Revocation

Session Core поддерживает server-side reasons:

- `user_sign_out`;
- `user_revoke`;
- `security_change`;
- `account_disabled`;
- `expired_cleanup`.

`revokeOwned()` всегда получает и `accountId`, и `sessionId`.

Это обязательная IDOR boundary: знание чужого session id само по себе не даёт право его отзывать.

`revokeOwned()` и `revokeAllForAccount()` возвращают explicit `ok/error` results. Database failure не маскируется под `false` или `0`.

## Session list

`listForAccount()` также возвращает explicit result:

- `{ ok: true, sessions }`;
- `{ ok: false, error }`.

Ошибка database не выглядит как `[]`, потому что UI не должен сообщать `Других устройств нет`, если backend просто недоступен.

Список:

- scoped по account id;
- исключает revoked/expired/malformed records;
- сортируется по `lastSeenAt`;
- current session определяется только через trusted current session id.

## lastSeen

`lastSeenAt` является non-authoritative metadata.

Если session прошла все security checks, но best-effort `touch()` не удался, пользователь не разлогинивается только из-за сбоя обновления telemetry metadata.

Security checks при следующем запросе выполняются снова.

## Candidate session policy

`SESSION_POLICY_CANDIDATE` сейчас:

- TTL: 30 days;
- lastSeen touch interval: 5 minutes;
- max list size: 50.

Это **технические значения backend spike**, а не утверждённые production retention/product limits.

До public release они должны пройти отдельный security/privacy review.

## Фактические smoke tests

`npm run test:server-auth` теперь компилирует и выполняет:

1. `email-otp-core-smoke`;
2. `session-core-smoke`.

Последняя версия обоих server domains фактически проверена в доступной isolated environment:

- Node `22.16.0`;
- TypeScript `5.8.3`;
- `strict`;
- `noUncheckedIndexedAccess`;
- `exactOptionalPropertyTypes`.

Результаты:

- `ARVELIS email OTP auth core smoke: PASS`;
- `ARVELIS server session core smoke: PASS`.

Session smoke проверяет:

- 128-bit id / 256-bit secret;
- raw secret не хранится;
- WebCrypto MAC verification;
- wrong secret rejection;
- valid authentication;
- lastSeen touch;
- session list + current marker;
- list database failure semantics;
- account-scoped revoke / IDOR boundary;
- revoke database failure semantics;
- suspended account cannot receive/authenticate session;
- `securityVersion` invalidation;
- expiry cleanup;
- unsafe label rejection;
- invalid policy rejection.

Это не заменяет repository TypeScript `6.0.3`, hosted CI и полный `npm run check`.

## Что НЕ подключено

- production Account DB;
- production Session DB;
- Redis;
- email delivery provider;
- HTTP routes;
- cookie serializer/parser;
- CSRF topology;
- reverse proxy/client IP policy;
- recovery;
- email change flow;
- account deletion workflow;
- external IdP linking;
- roles/permissions;
- CONTROL owner/admin auth;
- AI.

## Следующий блокирующий product decision

Для соединения `VerifiedEmailOtpProof` с реальным Account creation/login orchestration нужно отдельно утвердить conflict UX/policy:

1. **Регистрация + email уже принадлежит Account** — автоматически войти или показать, что Account уже существует?
2. **Вход + verified email ещё не имеет Account** — предложить создать Account или показать, что Account не найден?

До этого решения Account/Identity contracts остаются безопасно нейтральными и не угадывают пользовательское поведение.
