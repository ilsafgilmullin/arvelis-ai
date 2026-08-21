# ARVELIS AI — Auth Server Contract Candidate

Статус: `CANDIDATE`, без production backend/provider.
Дата: 2026-08-21.

Цель документа — определить семантику между frontend и доверенным ARVELIS backend до выбора конкретного identity provider.

## Принцип

Frontend общается только с ARVELIS backend/auth gateway.

Frontend **не должен**:

- хранить provider client secrets;
- напрямую считать provider token авторитетной ARVELIS role/session;
- получать database credentials;
- принимать решение `owner/admin/user` по локальному флагу;
- показывать пользователю сырые provider/backend error details.

Конкретные HTTP paths ниже — рабочий contract candidate и могут измениться после backend topology review.

## 1. Capabilities / methods

### `GET /api/auth/methods`

Назначение: frontend получает реально доступные способы входа для текущей среды/региона.

Ответ описывает только UI-safe metadata:

- method id;
- kind: `identifier | external | passkey`;
- display label;
- enabled/disabled;
- identifier type, если применимо.

Не возвращаются:

- provider secrets;
- internal credentials;
- administrative configuration;
- приватные routing details.

Это позволяет отключить недоступный provider server-side без релиза нового frontend.

## 2. Restore current session

### `GET /api/auth/session`

Результат:

- authenticated session/account summary; или
- signed-out state.

Требования:

- не считать отсутствие session исключительной ошибкой;
- session authorization проверяется сервером;
- frontend account object содержит только необходимые UI-поля;
- role/permission details выдаются только если они реально нужны клиенту, но server remains authoritative.

## 3. Start authentication

### `POST /api/auth/start`

Рабочий request:

- intent: `sign_in | sign_up`;
- method id;
- identifier, если выбранный method его требует.

Backend отвечает challenge descriptor, например:

- `code`;
- `external_redirect`;
- `passkey`.

Security requirements:

- rate limiting;
- anti-automation controls;
- enumeration-resistant responses;
- normalized identifier processing server-side;
- не сообщать постороннему, существует ли конкретный аккаунт, если это создаёт enumeration risk;
- challenge имеет TTL, attempt limit и replay protection.

## 4. Complete authentication

### `POST /api/auth/complete`

Рабочий request:

- challenge id;
- challenge response/authorization result, если применимо.

Успех:

- backend создаёт/rotates server session;
- frontend получает только UI-safe session/account result;
- session secret не записывается JavaScript-кодом в localStorage.

Ошибка:

- возвращается нормализованный ARVELIS error code;
- сырые provider exceptions остаются server-side;
- sensitive details не отражаются пользователю.

## 5. Sign out

### `POST /api/auth/sign-out`

Требования:

- инвалидировать текущую server session;
- ответ должен быть idempotent с точки зрения UX: повторный sign-out не создаёт критическую ошибку;
- frontend после успеха возвращается в signed-out app-entry.

## 6. Session management

### `GET /api/auth/sessions`

Будущий Profile/Account Security получает минимальный список пользовательских сессий:

- session id/reference;
- created/last active timestamps;
- coarse device/browser metadata;
- current-session marker;
- expiration/revocation state.

Не возвращать:

- cookie/session secret;
- raw fingerprint material сверх реально необходимого UX/security use case.

### `DELETE /api/auth/sessions/:sessionId`

Отзыв конкретной сессии.

### `POST /api/auth/sessions/revoke-others`

Опциональный candidate: отозвать все остальные сессии после re-auth/step-up, если security review это утвердит.

## 7. Recovery

Recovery flow пока `OPEN` по продукту, но server contract обязан позволять отдельный start/complete lifecycle вместо клиентской «магии».

Candidate semantics:

- `POST /api/auth/recovery/start`;
- `POST /api/auth/recovery/complete`.

Обязательные свойства:

- enumeration resistance;
- short-lived single-use challenge;
- strong rate limits;
- revoke/rotate sessions после критического восстановления, если политика это требует;
- security event/audit entry.

## 8. Account lifecycle

Будущие server endpoints/operations должны поддержать:

- изменение display name/profile;
- linking/unlinking identity;
- export data;
- delete account;
- re-auth/step-up перед критическими изменениями.

Точные paths и scope — OPEN.

## Session transport candidate

Для web candidate предпочтителен защищённый server session cookie:

- `HttpOnly`;
- `Secure`;
- `SameSite` выбирается по фактической topology;
- rotation;
- TTL;
- server revoke.

CSRF strategy утверждается вместе с final same-origin/cross-origin architecture.

Frontend не строится вокруг long-lived bearer token в `localStorage`.

## Common response/error contract

Frontend должен получать стабильные коды, совместимые с `src/auth/contracts.ts`:

- `invalid_input`;
- `invalid_challenge`;
- `challenge_expired`;
- `rate_limited`;
- `account_locked`;
- `network_error` — обычно формируется frontend/network layer;
- `service_unavailable`;
- `access_denied`;
- `unknown`.

Backend logging может содержать внутренний correlation/request id, но frontend user copy не содержит stack traces или provider error payload.

## Anti-abuse baseline

До production auth нужны:

- per-IP / per-identifier / per-account rate limits по назначению endpoint;
- progressive throttling where appropriate;
- protection от credential stuffing для password-based method, если он вообще будет выбран;
- challenge attempt limits;
- suspicious sign-in telemetry с data minimization;
- explicit lock/recovery policy;
- safe generic errors против account enumeration;
- monitoring abnormal auth failure rates.

## ARVELIS CONTROL separation

CONTROL не использует этот пользовательский session realm как достаточную owner/admin authorization.

Для CONTROL требуется отдельный server-side policy/realm или строго отдельный admin authorization layer, включая step-up/MFA policy для опасных действий и обязательный audit.

## Не утверждено

- конкретный backend framework;
- конкретный auth provider;
- email/phone/password/OTP/passkey как final method;
- exact endpoint paths;
- exact cookie domain;
- exact role model;
- exact rate limits;
- exact recovery policy;
- production deployment region.
