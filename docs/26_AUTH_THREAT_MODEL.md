# ARVELIS AI — Authentication Threat Model

Дата: 2026-08-21.
Статус: `SECURITY BASELINE / IMPLEMENTATION PENDING`.

Документ задаёт минимальную модель угроз до подключения реальной авторизации. Он не заменяет production pentest, legal review или инфраструктурный threat model.

## Scope

В scope:

- пользовательский ARVELIS AI auth;
- Account / Identity / Session lifecycle;
- external OAuth/OIDC providers;
- challenge/recovery flows;
- device/session management;
- frontend ↔ ARVELIS BFF/Auth API boundary;
- разделение ARVELIS AI и ARVELIS CONTROL.

Вне текущего scope:

- AI prompt/tool security;
- billing fraud;
- production network perimeter;
- detailed database threat model;
- full CONTROL authorization matrix.

## Assets

Защищаем:

- ARVELIS Account ID;
- identity links;
- active sessions;
- recovery capability;
- verified email/phone metadata, если они будут использоваться;
- provider credentials/tokens server-side;
- security events/audit;
- user conversations/profile data, доступ к которым даёт session;
- owner/admin boundary CONTROL.

## Trust assumptions

### Browser/mobile client

Считается недоверенной средой.

Нельзя доверять:

- local flags;
- role/admin values;
- hidden form fields;
- client timestamps;
- localStorage;
- UI disabled state;
- client-side rate limits.

### ARVELIS BFF/Auth API

Доверенная security boundary, но её входные данные всегда валидируются.

### External IdP

Доверяется только в рамках проверенного protocol flow и конкретной identity claim policy. Provider не получает право назначать ARVELIS roles.

## Threat 1 — Account enumeration

### Риск

Атакующий выясняет, зарегистрирован ли email/телефон, по тексту ошибки, времени ответа, recovery flow или rate-limit behavior.

### Controls

- generic start/recovery responses;
- выравнивание observable behavior там, где practically needed;
- server-side normalization;
- rate limits per IP/identifier/account/context;
- не показывать «такой email зарегистрирован» без отдельного продукт/security решения;
- correlation details только в server logs.

## Threat 2 — Brute force / credential stuffing

Актуально, если будет password/code-based method.

Controls:

- server-side attempt counters;
- progressive throttling;
- short challenge TTL;
- challenge single-use;
- breached-password policy, если password вообще выбран;
- suspicious authentication telemetry;
- lock/recovery policy без permanent denial-of-service vector.

## Threat 3 — Session fixation

### Риск

Атакующий навязывает заранее известный session identifier до входа.

### Controls

- rotate/create new session после successful authentication;
- rotate после privilege/security-sensitive transitions;
- не принимать session id из URL/localStorage;
- cookie session id генерируется cryptographically strong server-side.

## Threat 4 — Session theft

### Векторы

- XSS;
- leaked bearer token;
- logs/analytics;
- insecure transport;
- shared device;
- stolen browser profile.

### Controls

- предпочтительно HttpOnly server session cookie;
- Secure;
- CSP/XSS hardening отдельно;
- никакого long-lived auth token в localStorage;
- secrets/tokens не отправляются в analytics/logs;
- session TTL/rotation/revoke;
- device/session management;
- re-auth/step-up для критических операций.

## Threat 5 — CSRF

Актуально при cookie-based auth.

Controls определяются final topology, но baseline:

- подходящий SameSite;
- CSRF token pattern для state-changing endpoints, если требуется topology;
- Origin validation;
- Fetch Metadata where applicable;
- CORS не считается CSRF protection;
- destructive account operations требуют отдельной protection/confirmation policy.

## Threat 6 — OAuth/OIDC state/nonce bypass

### Риск

Login CSRF, authorization response injection, token substitution.

### Controls

- cryptographically strong `state`;
- state привязан к конкретному auth transaction;
- single-use + TTL;
- OIDC nonce, где protocol требует;
- callback не принимает transaction без server-side record;
- provider/client/redirect binding проверяется server-side.

## Threat 7 — OAuth mix-up / wrong-provider callback

### Риск

Ответ одного IdP принимается как ответ другого provider/client.

### Controls

- challenge связан с `methodId/provider`;
- callback handler знает expected issuer/client;
- issuer/audience validation;
- exact registered redirect URI;
- не выбирать provider только из user-controlled callback parameter.

## Threat 8 — Open redirect

### Риск

Auth endpoint используется для перенаправления на phishing/malicious URL.

### Controls

- registered redirect allowlist server-side;
- никакого arbitrary `returnTo`;
- relative post-login navigation предпочтительнее произвольного URL;
- frontend `external_redirect` guard допускает только absolute HTTPS authorization URL;
- `javascript:` / `data:` / arbitrary HTTP блокируются.

## Threat 9 — Authorization code / challenge replay

Controls:

- short TTL;
- single-use transaction;
- PKCE where required/applicable;
- server marks challenge consumed atomically;
- duplicate completion does not create parallel uncontrolled sessions;
- recovery tokens use same replay-resistant principle.

## Threat 10 — Account linking takeover

Одна из самых критичных угроз multi-provider системы.

### Опасный сценарий

Автоматически связать две identities только потому, что provider прислал одинаковую строку email.

### Controls

- verified-claim policy;
- re-auth existing account before linking where appropriate;
- explicit conflict handling;
- provider subject + issuer treated as identity key;
- audit/security event;
- unlink не оставляет account без usable recovery/login path;
- session rotation/revoke policy после critical identity change.

## Threat 11 — Recovery takeover

Recovery фактически равен возможности захватить аккаунт.

Controls:

- отдельный recovery transaction;
- enumeration-resistant start;
- strong rate/attempt limits;
- short-lived single-use challenge;
- server-side audit/security event;
- уведомление пользователя, когда канал для этого утверждён;
- revoke/rotate sessions после recovery согласно policy;
- CONTROL recovery не наследует обычный user recovery flow.

## Threat 12 — Malformed / oversized backend response

### Риск

Повреждённый или скомпрометированный transport присылает некорректный JSON, duplicate ids или чрезмерный payload.

### Реализованный frontend foundation

- raw transport response начинается как `unknown`;
- `runtimeGuards.ts` валидирует методы, account, session, challenge, failure;
- `guardedGateway.ts` fail-closed;
- duplicate ids блокируются;
- две `current` sessions блокируются;
- defensive protocol ceilings ограничивают коллекции/поля;
- `emailVerified=true` без email и аналогичный phone state блокируются;
- unsafe authorization URL блокируется.

Server-side validation всё равно обязательна.

## Threat 13 — Provider outage / regional unavailability

### Риск

Один внешний IdP делает ARVELIS недоступным.

### Controls

- provider-independent Account ID;
- method catalog server-configurable;
- базовый access path не зависит от единственного иностранного IdP;
- multiple adapters/fallback strategy после product approval;
- existing valid ARVELIS session не зависит от availability method catalog;
- disable-provider rollback plan.

## Threat 14 — Raw provider error/data leakage

Controls:

- provider exceptions stay server-side;
- frontend uses stable ARVELIS failure codes;
- raw tokens/authorization codes/challenge secrets never logged in UI analytics;
- `presentation.ts` maps failures to safe user copy;
- debug logs must redact identity/session secrets.

## Threat 15 — Privilege escalation to CONTROL

### Риск

Обычный user account/session или frontend flag получает owner/admin capability.

### Controls

- CONTROL separate auth/authorization boundary;
- server-side RBAC/permissions;
- no `isAdmin=true` local authority;
- step-up/MFA policy for dangerous actions after approval;
- audit;
- session revoke;
- separate origin/client/realm policy candidate;
- destructive admin action confirmations plus server authorization.

## Threat 16 — Stored identity data / privacy overcollection

Controls:

- minimum scopes;
- provider data не копируется «на всякий случай»;
- account schema separates identity proof from product profile;
- retention/export/delete policy before production;
- РФ localization/transborder data-flow review;
- logs/telemetry data minimization.

## Security events baseline

Backend candidate должен создавать structured security events минимум для:

- sign-in success/failure;
- challenge start/failure/expiry;
- rate-limit/lock event;
- session create/rotate/revoke;
- revoke-all/revoke-others;
- recovery;
- identity link/unlink;
- critical account security change.

Не логировать:

- passwords;
- OTP/challenge codes;
- session cookie values;
- provider access/refresh tokens;
- full sensitive payload без необходимости.

## Required backend negative tests

До real auth release обязательны тесты, подтверждающие отказ для:

- invalid/expired/replayed challenge;
- wrong provider callback;
- wrong state/nonce;
- duplicate completion;
- malformed session response;
- oversized input;
- unauthorized session revoke;
- revoke чужого session id;
- account-link conflict;
- recovery abuse;
- missing CSRF/Origin protections по выбранной topology;
- ordinary user attempting CONTROL endpoint.

## Residual risks / OPEN

Нужны отдельные решения по:

- основной auth method;
- identity core;
- CSP/XSS policy production app;
- exact CSRF topology;
- bot/abuse provider;
- MFA/passkey;
- recovery channel;
- exact session TTL/rotation;
- alerting thresholds;
- CONTROL owner authentication;
- production infrastructure and data regions.
