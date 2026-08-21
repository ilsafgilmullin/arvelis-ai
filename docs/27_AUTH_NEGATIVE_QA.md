# ARVELIS AI — Auth Negative QA Gate

Статус: security/backend integration gate.
Дата: 2026-08-21.

Цель — заранее зафиксировать сценарии, в которых auth foundation обязан **fail closed**, не выдавать повреждённые данные за валидную сессию и не показывать пользователю ложный security state.

Это не подтверждение фактического backend-теста: production backend пока не подключён.

## 1. Method catalog

Должны быть отклонены/не попадать в application state:

- response не является массивом;
- элементов больше defensive ceiling;
- duplicate method id;
- неизвестный `kind`;
- `identifier` без `identifierType`;
- `external` с `identifierType`;
- oversized id/label;
- malformed enabled flag;
- control characters в protocol strings.

Временная ошибка method catalog **не инвалидирует уже восстановленную ARVELIS session**.

## 2. Session restore

Fail closed:

- malformed account/session object;
- пустой session/account id;
- пустой display name в server account object;
- пустой email/phone, если поле присутствует;
- invalid timestamp;
- `expiresAt <= createdAt`;
- `emailVerified=true` без email;
- `phoneVerified=true` без phone;
- oversized account/display fields;
- control characters в server-provided account/session strings.

`null` означает обычный signed-out state и не считается protocol error.

## 3. Start auth

Outgoing request блокируется до transport, если:

- intent неизвестен;
- method id пустой/oversized;
- method id содержит control characters;
- identifier присутствует, но пустой после trim;
- identifier превышает defensive ceiling;
- identifier содержит control characters.

Backend всё равно повторно валидирует request и остаётся источником истины.

## 4. Code challenge

`code` challenge не может содержать `redirectUrl`.

Допустимы только:

- id;
- method id;
- optional non-empty masked destination;
- optional expiry.

`complete()` разрешён только если:

- controller находится в active `challenge` state;
- challenge kind = `code`;
- request challenge id совпадает с активным challenge;
- response непустой и находится в protocol ceiling;
- challenge id/response не содержат control characters.

Stale/чужой challenge id не отправляется в transport.

Recoverable ошибка подтверждения сохраняет active code challenge, чтобы пользователь мог повторить ввод без запуска нового flow. Expired/locked/denied state может завершить challenge по policy.

## 5. External redirect challenge

`external_redirect` обязан иметь:

- id;
- method id;
- абсолютный HTTPS redirect URL.

Fail closed:

- `http:`;
- `javascript:`;
- `data:`;
- относительный URL;
- malformed URL;
- oversized URL;
- URL с embedded credentials;
- URL fragment;
- control characters;
- `maskedDestination` в external challenge.

Frontend HTTPS guard **не заменяет** backend provider allowlist.

External OAuth callback не проходит через frontend `complete()`; callback завершается ARVELIS backend/BFF, после чего frontend восстанавливает ARVELIS session.

## 6. Complete response

Fail closed:

- response не discriminated success/error object;
- success без валидной session;
- error без поддерживаемого ARVELIS failure code;
- malformed/oversized error fields;
- oversized `retryAfterSeconds`.

Raw backend/provider error message не отображается напрямую пользователю.

## 7. Session list

Ошибка списка сессий не отображается как «других устройств нет».

Fail closed:

- response не массив;
- элементов больше defensive ceiling;
- duplicate session id;
- больше одной `current` session;
- `expiresAt <= createdAt`;
- `lastSeenAt` раньше `createdAt` или позже `expiresAt`;
- пустой device/browser label, если поле присутствует;
- malformed timestamps/labels.

UI отдельно различает:

- idle/not loaded;
- loading;
- error;
- ready + empty;
- ready + sessions.

## 8. Revoke session

До transport блокируются:

- пустой session id;
- oversized session id;
- session id с control characters.

Backend обязан:

- проверять ownership;
- не позволять revoke чужой session;
- определить policy для текущей session;
- записать security event, если это утверждено audit policy.

После успешного revoke frontend перечитывает session list.

## 9. Sign out / live-session integrity

Frontend не показывает подтверждённый logout, если server-side sign-out завершился ошибкой.

При failed logout:

- live session сохраняется в auth state;
- session list не маскируется как «пустой»;
- пользователь видит, что сессия по-прежнему считается активной.

Локальные UI-события не должны молча уничтожать live-session state:

- `SET_INTENT` (`Вход / Регистрация`) во время authenticated/signing-out/sign-out-error не разлогинивает пользователя;
- browser offline event сам по себе не разлогинивает уже authenticated пользователя.

После подтверждённого logout:

- auth state = signed out;
- device/session cache очищается;
- user product data не удаляется автоматически.

## 10. Intent preservation

Если `sign_up` flow получает recoverable/global error до создания сессии:

- error/rate/offline state сохраняет исходный `sign_up` intent;
- Retry/Reset возвращает пользователя в `sign_up`, а не самопроизвольно в `sign_in`.

То же правило применяется симметрично к `sign_in`.

## 11. Network / stale async

Проверить:

- response старого `restore` не перезаписывает более новый auth flow;
- старый method request не перезаписывает новый catalog;
- старый session-list request не перезаписывает новый list;
- unmount/gateway change инвалидирует pending sequences;
- offline/network error не выдаётся за invalid credentials;
- временный сбой method catalog не инвалидирует существующую session;
- ошибка session-list не инвалидирует существующую session.

## 12. OAuth/OIDC backend negative cases

До production внешний provider должен иметь отдельные tests:

- state mismatch;
- missing/expired transaction;
- PKCE failure, когда применимо;
- nonce mismatch для OIDC, когда применимо;
- issuer mismatch;
- client/audience mismatch;
- callback replay;
- unregistered redirect;
- open redirect attempt;
- provider mix-up;
- provider outage;
- denied/cancelled authorization.

Provider code/token не должен попадать в application logs или localStorage.

## 13. Account linking / recovery

До production обязательны negative tests:

- автоматическое linking только по совпавшему email запрещено как default;
- recovery challenge replay;
- recovery enumeration;
- recovery rate abuse;
- linking без re-auth/verification policy;
- critical identity change без session rotation/revoke policy.

## 14. ARVELIS CONTROL

Обычная user session не даёт административных прав.

Fail closed:

- frontend role flag;
- hidden URL;
- обычный user cookie без server-side admin authorization;
- попытка вызвать CONTROL action без owner/admin permission;
- stale/revoked admin session;
- dangerous action без требуемого step-up/confirmation/audit policy.

## Automated smoke coverage

`npm run test:auth` — no-dependency Auth Core smoke для pure contract слоя.

На текущем этапе он покрывает, в том числе:

- unsafe external URL;
- mixed challenge fields;
- malformed account/session metadata;
- invalid session time windows;
- invalid `lastSeenAt` window;
- verified identifier inconsistency;
- oversized retry metadata;
- duplicate methods;
- multiple current sessions;
- malformed outgoing method/identifier/code payloads;
- sign-up intent preservation;
- recoverable code challenge preservation;
- live-session preservation при mode switch/offline;
- live-session preservation при failed logout.

Это не заменяет будущие backend/integration/e2e tests.

## Merge/backend spike gate

Перед первым реальным auth backend integration:

1. executable v1 contract и server API contract не расходятся;
2. negative scenarios превращены в автоматические backend/integration tests;
3. session/cookie/CSRF topology утверждена;
4. provider callback allowlists/state/PKCE/nonce policy утверждены;
5. rate-limit/recovery/account-linking policy утверждены;
6. data-flow/legal review для production infrastructure выполнен;
7. user auth и ARVELIS CONTROL authorization остаются раздельными security realms/policies.
