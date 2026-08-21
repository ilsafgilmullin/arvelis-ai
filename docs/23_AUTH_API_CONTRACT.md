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

## Executable v1 capability scope

Текущий TypeScript contract намеренно поддерживает только:

- `identifier` — будущий email/phone-based flow после отдельного решения;
- `external` — внешний OAuth/OIDC provider через ARVELIS backend/BFF.

Challenge v1:

- `code`;
- `external_redirect`.

`passkey/WebAuthn` остаётся **OPEN architectural candidate** и не считается реализованным v1 contract. Перед его включением нужен отдельный WebAuthn request/response contract для web/native, challenge/options validation и backend ceremony verification.

## 1. Capabilities / methods

### `GET /api/auth/methods`

Назначение: frontend получает реально доступные способы входа для текущей среды/региона.

Ответ описывает только UI-safe metadata:

- method id;
- kind: `identifier | external`;
- display label;
- enabled/disabled;
- identifier type, если применимо.

Не возвращаются:

- provider secrets;
- internal credentials;
- administrative configuration;
- приватные routing details.

Это позволяет отключить недоступный provider server-side без релиза нового frontend.

Method catalog не является prerequisite для уже существующей валидной ARVELIS session. Временный сбой `/methods` не должен разлогинивать пользователя.

## 2. Restore current session

### `GET /api/auth/session`

Результат:

- authenticated session/account summary; или
- signed-out state.

Требования:

- отсутствие session не считается исключительной ошибкой;
- session authorization проверяется сервером;
- frontend account object содержит только необходимые UI-поля;
- role/permission details выдаются только если они реально нужны клиенту, но server остаётся authoritative;
- restore session обрабатывается независимо от method catalog и device/session list.

## 3. Start authentication

### `POST /api/auth/start`

Рабочий request:

- intent: `sign_in | sign_up`;
- method id;
- identifier, если выбранный method его требует.

Backend отвечает challenge descriptor:

- `code`; или
- `external_redirect`.

Security requirements:

- rate limiting;
- anti-automation controls;
- enumeration-resistant responses;
- normalized identifier processing server-side;
- не сообщать постороннему, существует ли конкретный аккаунт, если это создаёт enumeration risk;
- challenge имеет TTL, attempt limit и replay protection.

### `code`

Используется для first-party challenge, который frontend может завершить через `/api/auth/complete`.

Frontend получает только:

- challenge id;
- method id;
- optional masked destination;
- optional expiry.

### `external_redirect`

Используется для внешнего OAuth/OIDC входа.

Frontend получает:

- challenge id;
- method id;
- абсолютный HTTPS authorization URL;
- optional expiry.

Redirect URL — это server-issued navigation target. Production backend обязан строить его только из заранее зарегистрированного/allowlisted provider configuration.

## 4. Complete first-party code challenge

### `POST /api/auth/complete`

Этот endpoint в executable v1 contract применяется **только к `code` challenge**.

Request:

- challenge id;
- непустой challenge response/code.

Frontend controller обязан убедиться, что:

- текущий UI state действительно содержит активный `code` challenge;
- challenge id совпадает с активной транзакцией;
- stale/чужой challenge id не отправляется в transport.

Успех:

- backend валидирует challenge server-side;
- challenge single-use/replay rules применяются на сервере;
- backend создаёт/rotates собственную ARVELIS server session;
- frontend получает только UI-safe session/account result;
- session secret не записывается JavaScript-кодом в localStorage.

Ошибка:

- возвращается нормализованный ARVELIS error code;
- сырые provider/internal exceptions остаются server-side;
- sensitive details не отражаются пользователю.

## 5. External OAuth/OIDC callback

External provider **не завершает вход через универсальный frontend `complete()`**.

Рабочая web/BFF семантика:

1. `/api/auth/start` создаёт server-side auth transaction и возвращает `external_redirect` challenge;
2. браузер переходит по server-issued HTTPS authorization URL;
3. provider возвращает браузер на зарегистрированный callback ARVELIS backend/BFF;
4. backend проверяет transaction binding, `state`, issuer/client/audience, PKCE/nonce там, где применимо, и защищается от replay/mix-up;
5. backend завершает/связывает identity и создаёт ARVELIS server session;
6. backend перенаправляет браузер только на заранее разрешённый app return location;
7. frontend после возврата вызывает `restoreSession()`.

Provider authorization code, access token или refresh token **не должны становиться обычным React-state/URL query, который приложение читает и хранит самостоятельно**.

OAuth provider secrets/tokens остаются за trusted backend boundary.

## 6. Sign out

### `POST /api/auth/sign-out`

Требования:

- инвалидировать текущую server session;
- операция проектируется idempotent server-side;
- frontend переходит в signed-out состояние только после подтверждённого результата либо отдельно утверждённой degraded policy;
- сетевой/серверный сбой не должен визуально выдаваться за подтверждённый revoke.

## 7. Session management

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

Frontend различает:

- `loading`;
- `error`;
- `idle/not loaded`;
- `ready + empty`;
- `ready + sessions`.

Ошибка API **не отображается как отсутствие активных устройств**.

### `DELETE /api/auth/sessions/:sessionId`

Отзыв конкретной сессии.

Server requirements:

- проверять ownership session id;
- не позволять отзывать чужую сессию;
- после успеха клиент перечитывает актуальный список;
- current-session behavior утверждается отдельно.

### `POST /api/auth/sessions/revoke-others`

Опциональный candidate: отозвать все остальные сессии после re-auth/step-up, если security review это утвердит.

## 8. Recovery

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

## 9. Account lifecycle

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

## Runtime protocol boundary

Raw HTTP/provider transport response начинается как `unknown`.

Frontend foundation:

`AuthTransport → guardedGateway → AuthGateway → controller/UI`.

`runtimeGuards.ts` / `guardedGateway.ts` проверяют до попадания данных в application state:

- shape account/session/challenge/failure;
- discriminated `code` vs `external_redirect` challenge fields;
- bounded protocol field lengths;
- bounded method/session collection sizes;
- duplicate ids;
- максимум одну `current` session;
- согласованность verified email/phone fields;
- absolute HTTPS URL для `external_redirect`;
- outgoing method/challenge ids и code response size;
- непустой response для first-party code completion.

Это defensive frontend boundary. **Backend обязан валидировать всё повторно** и остаётся источником истины.

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

## Связанные документы

- `docs/20_AUTH_ARCHITECTURE.md`;
- `docs/21_AUTH_DATA_MODEL.md`;
- `docs/24_AUTH_PROVIDER_RESEARCH_2026-08-21.md`;
- `docs/25_AUTH_CORE_BOUNDARY.md`;
- `docs/26_AUTH_THREAT_MODEL.md`.

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
