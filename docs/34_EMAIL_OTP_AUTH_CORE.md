# ARVELIS AI — Email OTP Auth Core

Дата: 2026-08-21.
Статус: **APPROVED method + server foundation candidate**.
Ветка: `feat/email-otp-auth-core-v1`.

## Утверждённое продуктово решение

Первый базовый способ регистрации и входа ARVELIS AI:

**email + одноразовый код, без пароля (passwordless OTP).**

Это решение подтверждено отдельно пользователем 2026-08-21.

Следствия:

- постоянный пароль не является обязательным credential первого auth release;
- пользователь подтверждает владение email короткоживущим одноразовым кодом;
- Yandex ID / VK ID / Apple / Google остаются дополнительными external-provider adapters, а не обязательной базой аккаунта;
- ARVELIS Account/Session semantics остаются собственными и server-authoritative;
- provider/email-delivery token не становится frontend session.

## Что реализовано в этой ветке

Создан отдельный server-domain:

`server/auth/emailOtp/`

Он **не входит** в `src/`, Vite frontend bundle или `tsconfig.app.json`.

### Components

- `contracts.ts` — server-side ports и challenge contracts;
- `policy.ts` — централизованные security candidate defaults;
- `emailAddress.ts` — bounded email normalization/validation;
- `webCryptoSecurity.ts` — Web Crypto OTP generation + HMAC/privacy keys;
- `service.ts` — start/verify lifecycle.

### Server ports

Реализация не привязана к конкретному vendor:

- `EmailOtpChallengeStore`;
- `EmailOtpDeliveryPort`;
- `EmailOtpRateLimitPort`;
- `EmailOtpSecurityPort`.

Поэтому позже можно отдельно выбрать:

- PostgreSQL/Redis/другой persistence adapter;
- российского/другого email delivery provider;
- конкретный backend framework;
- deployment topology.

## OTP security lifecycle

### Start

1. email проходит bounded normalization/validation;
2. rate-limit применяется к privacy-preserving HMAC key, а не к raw email в limiter API;
3. генерируется 128-bit challenge id;
4. генерируется numeric OTP;
5. в challenge storage сохраняется только HMAC кода, привязанный к challenge id + email;
6. raw code передаётся только в `EmailOtpDeliveryPort`;
7. новый challenge supersede'ит предыдущий активный challenge для того же email + intent;
8. frontend получает только challenge id, masked email и expiry.

На `start` Auth Core **не проверяет существование аккаунта**. Это уменьшает email-enumeration surface.

### Verify

1. challenge id и code валидируются до storage;
2. применяются verify rate-limits;
3. persistence adapter атомарно увеличивает attempt counter через `beginAttempt()`;
4. candidate code HMAC сравнивается с stored HMAC;
5. неправильный код расходует attempt;
6. после max attempts challenge блокируется;
7. правильный code должен атомарно `consume()` challenge;
8. replay consumed/superseded code отклоняется;
9. успешный результат — внутренний `VerifiedEmailOtpProof`.

`VerifiedEmailOtpProof` не является frontend response. Его должен немедленно потребить trusted account/session application layer.

## Challenge persistence requirements

Production `EmailOtpChallengeStore` обязан реализовать атомарность:

- `createReplacingActive()`;
- `beginAttempt()`;
- `consume()`.

Иначе concurrent verification может создать replay/race condition.

Challenge records должны быть short-lived и очищаться после expiry/consumption по retention policy.

## Raw code handling

Raw OTP:

- не хранится в challenge record;
- не логируется;
- не возвращается frontend;
- пересекает только delivery port;
- после delivery не требуется приложению повторно.

Stored verifier:

- HMAC-SHA-256;
- domain-separated payload;
- server pepper минимум 32 random bytes;
- pepper приходит только из protected server environment/configuration;
- pepper не добавляется в GitHub, frontend, docs screenshots или logs.

Обычный SHA-256 от шестизначного OTP не используется, потому что такой hash легко перебрать offline.

## Candidate policy values

`EMAIL_OTP_POLICY_CANDIDATE` сейчас содержит технические defaults первого backend spike:

- OTP: 6 digits;
- TTL: 10 minutes;
- max code attempts: 5;
- separate start/verify email/client/challenge rate-limit windows.

Это **не финальные production/product limits**.

До public release их нужно подтвердить abuse-testing и реальной delivery telemetry.

## Email identifier candidate

Текущий server foundation намеренно поддерживает bounded public ASCII mailbox identifiers.

- total length <= 254;
- local-part <= 64;
- control/format characters запрещены;
- invalid dot/local/domain patterns отклоняются;
- domain переводится в lower-case;
- local-part casing пока сохраняется.

Почему local-part не lower-case автоматически: exact account uniqueness/canonicalization semantics ещё не утверждены.

Internationalized email (SMTPUTF8/EAI) пока OPEN compatibility decision.

## Account/session boundary

Email OTP service **не создаёт ARVELIS Account и не устанавливает browser cookie**.

После подтверждения кода следующий trusted server layer должен:

1. consume internal verified-email proof;
2. разрешить `sign_in/sign_up` semantics;
3. найти/создать ARVELIS Account;
4. применить account status/security policy;
5. создать/rotate ARVELIS server session;
6. BFF/HTTP layer устанавливает защищённый session cookie.

Это разделение намеренно: product data model, account duplicate/linking semantics, session persistence и backend topology ещё требуют отдельного утверждения.

## Anti-enumeration

`start()` не спрашивает Account repository, существует ли email.

Это позволяет API давать одинаковую start-response semantics для существующего/не существующего аккаунта.

После успешного proof пользователь уже подтвердил владение email; точная sign-in/sign-up conflict UX policy утверждается отдельно.

## Delivery failure

Если email provider не принял отправку:

- клиент получает generic `delivery_unavailable`;
- challenge удаляется best-effort;
- raw provider exception не возвращается пользователю;
- неуспешная доставка не выдаётся за отправленный код.

## Rate limiting

Rate limiter получает HMAC-derived privacy keys.

Candidate scopes:

- `start_email`;
- `start_client`;
- `verify_challenge`;
- `verify_client`.

HTTP/BFF adapter должен определить privacy-safe `clientKey` с учётом reverse proxy/CDN topology. Нельзя слепо доверять произвольному `X-Forwarded-For` из открытого интернета.

## Tests

Добавлен:

`tests/email-otp-core-smoke.ts`

Проверяет:

- email normalization/rejection;
- 6-digit generator;
- HMAC instead of raw OTP storage;
- wrong code;
- successful verification;
- single-use/replay;
- supersede old challenge;
- max attempts lock;
- expiry;
- email delivery rollback;
- rate-limit rejection;
- challenge-bound MAC.

Новый script:

`npm run test:server-auth`

А `npm run check` теперь включает:

`typecheck → test:auth → test:server-auth → build`.

## Smoke runtime fix

Найден старый tooling defect:

- `tsconfig.auth-smoke.json` emit'ит CommonJS `.js`;
- root package имеет `"type": "module"`;
- без локальной package boundary Node 22 трактует emitted `.js` как ESM и CommonJS smoke может упасть до assertions.

Добавлен:

`scripts/prepare-smoke-runtime.mjs`

Он создаёт внутри временных ignored dist directories только runtime `package.json` с `{"type":"commonjs"}`.

Production output это не затрагивает.

## Что НЕ подключено

- реальный SMTP/email API;
- production database;
- Redis;
- HTTP routes;
- cookies;
- Account creation;
- production Session storage;
- recovery;
- external IdP;
- MFA/passkeys;
- CONTROL auth;
- AI.

Никакой из этих функций нельзя считать работающей на основании этого server foundation.

## OPEN — следующий decision layer

Перед реальным HTTP/backend integration нужно отдельно решить:

1. backend framework/runtime topology;
2. primary account database;
3. OTP challenge persistence/storage;
4. email delivery provider;
5. account `sign_in/sign_up` conflict semantics;
6. server session persistence + cookie topology;
7. privacy/retention/region requirements;
8. production rate-limit store/topology;
9. email case/duplicate/linking policy;
10. monitoring/security event storage.

## Security invariants до production

- server-side validation повторяется независимо от frontend;
- rate-limits fail safely;
- challenge operations atomic;
- session secret никогда не хранится frontend localStorage;
- email provider secrets только environment/secret manager;
- OTP code не логируется;
- security events не содержат raw OTP;
- account enumeration минимизируется;
- production infrastructure для данных граждан РФ проходит отдельный legal/infrastructure review;
- ARVELIS CONTROL остаётся отдельной owner/admin security boundary.
