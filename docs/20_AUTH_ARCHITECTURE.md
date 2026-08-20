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
- поддерживаются logout, revoke, session-expired и recovery flows;
- инфраструктура и поставщики отдельно проверяются на доступность в России;
- ARVELIS CONTROL использует **отдельную** owner/admin auth boundary и не делит user session с ARVELIS AI.

## Provider-independent frontend port

`src/auth/contracts.ts` определяет `AuthGateway`:

- `getMethods()` — сервер сообщает доступные способы входа;
- `restoreSession()` — восстановление текущей серверной сессии;
- `start()` — начало sign-in/sign-up независимо от конкретного метода;
- `complete()` — завершение challenge/redirect/passkey flow;
- `signOut()`;
- `revokeSession()`.

Frontend не должен содержать условие вида «если Firebase/Google/Yandex — тогда вся логика приложения другая».

## Auth methods

Конкретный production-набор **OPEN**.

Архитектура допускает:

- identifier flow: email или phone;
- external provider;
- passkey.

Это не означает, что все методы войдут в MVP.

### Рабочая техническая рекомендация

Для первого production candidate предпочтителен независимый базовый способ входа, который не делает ARVELIS AI недоступным при проблемах одного внешнего OAuth-провайдера. Практически это означает иметь собственный серверный identifier-flow (например email challenge/OTP) как fallback/base, а Apple/Google/российские IdP подключать через адаптеры при отдельном утверждении.

Эта рекомендация **не является утверждением email/OTP как финального метода**.

## Session candidate

Рекомендуемая web-модель:

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
8. authenticated;
9. invalid/expired challenge;
10. rate limited;
11. offline/network error;
12. service unavailable;
13. access denied/account locked;
14. session expired;
15. sign out;
16. revoke session.

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

## ARVELIS CONTROL

CONTROL не использует пользовательскую сессию ARVELIS AI.

До real-data integration для CONTROL обязательны:

- отдельный auth policy;
- server-side owner/admin RBAC;
- stronger/step-up auth policy для опасных действий;
- immutable/tamper-resistant audit;
- session/device revoke;
- production origin isolation.

## Что можно делать сейчас

- polished entry/auth UI;
- form/accessibility/keyboard states;
- provider-independent contracts;
- loading/error/offline/rate-limit/session-expired screens;
- account/security layout в Profile;
- preview adapter, если он явно не выдаётся за production auth.

## Что нельзя выдавать за работающую production auth

- отправку email/OTP без backend;
- Google/Apple/Yandex login без реального provider integration;
- server session;
- password reset;
- account recovery;
- MFA/passkeys;
- owner/admin CONTROL access.
