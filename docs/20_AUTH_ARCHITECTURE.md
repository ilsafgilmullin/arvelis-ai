# ARVELIS AI — Production Auth Architecture Candidate

Статус: `CANDIDATE`, **не production implementation**.
Дата: 2026-08-21.
Ветка: `feat/auth-foundation-v1`.

## Цель

Подготовить авторизацию так, чтобы пользовательский frontend не зависел от конкретного зарубежного или российского identity provider и не пришлось переписывать продукт при смене способа входа.

## Зафиксированные требования

- frontend не является источником истины для authentication/authorization;
- роли и permissions проверяются сервером;
- provider secrets не передаются клиенту;
- session secrets не хранятся в localStorage;
- реальные account/session данные появляются только после trusted backend;
- поддерживаются logout, revoke, session-expired и recovery lifecycle на уровне архитектуры;
- инфраструктура и поставщики отдельно проверяются на доступность в России;
- ARVELIS CONTROL использует **отдельную** owner/admin auth boundary и не делит user session с ARVELIS AI.

## Auth Core boundary

ARVELIS владеет собственной семантикой:

- Account ID;
- Identity links;
- Session lifecycle;
- account security lifecycle;
- security events;
- authorization policy.

Identity engine и внешние IdP остаются заменяемыми компонентами за backend boundary.

Целевое направление:

`ARVELIS App → ARVELIS BFF/Auth API → Auth Core / Identity Adapter → External IdP`.

Provider token не становится собственной browser session ARVELIS.

## Provider-independent frontend port

`src/auth/contracts.ts` определяет `AuthGateway`:

- `getMethods()` — сервер сообщает доступные способы входа;
- `restoreSession()` — восстановление текущей серверной сессии;
- `start()` — начало sign-in/sign-up;
- `complete()` — завершение v1 challenge flow;
- `signOut()`;
- `listSessions()`;
- `revokeSession()`.

Raw transport не считается доверенным только из-за TypeScript-типа.

`AuthTransport → guardedGateway → AuthGateway`:

- network/provider JSON начинается как `unknown`;
- runtime guards проверяют форму и defensive ceilings;
- malformed payload fail closed;
- components/controller получают только guarded contract.

## Executable v1 methods

Текущий **исполняемый foundation-контракт** намеренно ограничен:

- `identifier` — будущий email/phone flow после отдельного решения;
- `external` — внешний OAuth/OIDC provider через ARVELIS backend.

Challenge v1:

- `code`;
- `external_redirect`.

Это контракт foundation, а не работающая production-auth.

## Future auth methods

Конкретный production-набор остаётся `OPEN`.

В research допускаются будущие варианты:

- passwordless OTP/magic link;
- password, если будет отдельно обоснован;
- passkey/WebAuthn;
- external providers;
- комбинации/fallback.

**Passkey/WebAuthn сейчас не входит в executable TypeScript contract.** До включения нужен отдельный browser/native WebAuthn request-response contract, ceremony validation и backend verification.

## Session restore resilience

Session restore, method catalog и device/session list являются независимыми ресурсами.

Правила:

- временный сбой method catalog не инвалидирует уже существующую валидную ARVELIS session;
- сбой списка устройств не выглядит как «других сессий нет»;
- session-expired — отдельное UI/security state;
- каждый async resource защищён от stale response в controller foundation.

## Runtime protocol rules

Frontend boundary блокирует до application state:

- malformed methods/account/session/challenge/failure;
- duplicate ids;
- oversized protocol collections/fields;
- inconsistent verified email/phone state;
- больше одной `current` session;
- unsafe external authorization URL;
- повреждённые outgoing method/challenge identifiers.

`external_redirect` на клиентской границе допускается только как absolute HTTPS URL. Production backend дополнительно обязан использовать зарегистрированный/allowlisted provider endpoint; HTTPS-check не заменяет server allowlist.

## Session candidate

Рекомендуемая web-модель-кандидат:

- серверная session;
- browser получает только защищённый session cookie;
- `HttpOnly`;
- `Secure`;
- подходящий `SameSite`;
- rotation/TTL;
- session revoke;
- device/session list в Профиле;
- CSRF model определяется вместе с backend/API topology.

Токен, которому достаточно кражи из localStorage для полного захвата аккаунта, не используется как предпочтительная web-session модель.

## Required UI states

Авторизация должна поддерживать минимум:

1. checking session;
2. signed out;
3. sign in;
4. sign up;
5. submitting;
6. challenge/code;
7. external redirect return;
8. verifying;
9. authenticated;
10. invalid/expired challenge;
11. rate limited;
12. offline/network error;
13. service unavailable;
14. access denied/account locked;
15. session expired;
16. sign out;
17. session-list loading/error/ready;
18. revoke session.

## Account lifecycle

До production отдельно утверждаются:

- identifier verification policy;
- account recovery;
- account deletion;
- export/delete data;
- retention;
- duplicate account/linking policy;
- provider linking/unlinking;
- age/legal constraints;
- suspicious login handling.

Автоматическое связывание аккаунтов только по строке email не принимается как безопасное базовое допущение.

## OAuth/OIDC baseline

Перед первым external provider обязательны:

- Authorization Code flow;
- PKCE там, где protocol/client topology этого требует;
- state transaction binding;
- OIDC nonce, когда применимо;
- exact registered redirect URI;
- server-side issuer/client/audience validation;
- protection от callback replay/mix-up/open redirect;
- минимальные scopes;
- provider secrets/tokens не попадают во frontend/logs.

## ARVELIS CONTROL

CONTROL не использует пользовательскую сессию ARVELIS AI.

До real-data integration для CONTROL обязательны:

- отдельный auth policy;
- server-side owner/admin RBAC;
- stronger/step-up auth policy для опасных действий;
- audit;
- session/device revoke;
- production origin/client/realm isolation policy.

## Россия / инфраструктура

Production account/auth storage, список персональных данных, регионы обработки, external IdP data flows и трансграничные передачи проходят отдельный legal/security review до реальных аккаунтов.

Архитектура специально сохраняет внутренний ARVELIS Account ID, чтобы смена внешнего IdP не требовала смены product identity model.

## Что можно делать сейчас

- polished entry/auth UI;
- form/accessibility/keyboard states;
- provider-independent contracts;
- runtime protocol guards;
- loading/error/offline/rate-limit/session-expired screens;
- account/security layout в Profile;
- threat model/negative QA;
- preview adapter, если он явно не выдаётся за production auth.

## Что нельзя выдавать за работающую production auth

- отправку email/OTP без backend;
- Google/Apple/Yandex/VK login без реального provider integration;
- server session;
- password reset;
- account recovery;
- MFA/passkeys;
- real device/session list;
- owner/admin CONTROL access.

## Связанные документы

- `docs/21_AUTH_DATA_MODEL.md`;
- `docs/23_AUTH_API_CONTRACT.md`;
- `docs/24_AUTH_PROVIDER_RESEARCH_2026-08-21.md`;
- `docs/25_AUTH_CORE_BOUNDARY.md`;
- `docs/26_AUTH_THREAT_MODEL.md`.
