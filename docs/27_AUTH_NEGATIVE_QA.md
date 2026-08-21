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
- malformed enabled flag.

Временная ошибка method catalog **не инвалидирует уже восстановленную ARVELIS session**.

## 2. Session restore

Fail closed:

- malformed account/session object;
- пустой session/account id;
- invalid timestamp;
- `emailVerified=true` без email;
- `phoneVerified=true` без phone;
- oversized account/display fields.

`null` означает обычный signed-out state и не считается protocol error.

## 3. Start auth

Outgoing request блокируется до transport, если:

- intent неизвестен;
- method id пустой/oversized;
- identifier превышает defensive ceiling.

Backend всё равно повторно валидирует request и остаётся источником истины.

## 4. Code challenge

`code` challenge не может содержать `redirectUrl`.

Допустимы только:

- id;
- method id;
- optional masked destination;
- optional expiry.

`complete()` разрешён только если:

- controller находится в active `challenge` state;
- challenge kind = `code`;
- request challenge id совпадает с активным challenge;
- response непустой и находится в protocol ceiling.

Stale/чужой challenge id не отправляется в transport.

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
- `maskedDestination` в external challenge.

Frontend HTTPS guard **не заменяет** backend provider allowlist.

External OAuth callback не проходит через frontend `complete()`; callback завершается ARVELIS backend/BFF, после чего frontend восстанавливает ARVELIS session.

## 6. Complete response

Fail closed:

- response не discriminated success/error object;
- success без валидной session;
- error без поддерживаемого ARVELIS failure code;
- malformed/oversized error fields.

Raw backend/provider error message не отображается напрямую пользователю.

## 7. Session list

Ошибка списка сессий не отображается как «других устройств нет».

Fail closed:

- response не массив;
- элементов больше defensive ceiling;
- duplicate session id;
- больше одной `current` session;
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
- oversized session id.

Backend обязан:

- проверять ownership;
- не позволять revoke чужой session;
- определить policy для текущей session;
- записать security event, если это утверждено audit policy.

После успешного revoke frontend перечитывает session list.

## 9. Sign out

Frontend не показывает подтверждённый logout, если server-side sign-out завершился ошибкой.

После подтверждённого logout:

- auth state = signed out;
- device/session cache очищается;
- user product data не удаляется автоматически.

## 10. Network / stale async

Проверить:

- response старого `restore` не перезаписывает более новый auth flow;
- старый method request не перезаписывает новый catalog;
- старый session-list request не перезаписывает новый list;
- unmount/gateway change инвалидирует pending sequences;
- offline/network error не выдаётся за invalid credentials.

## 11. OAuth/OIDC backend negative cases

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

## 12. Account linking / recovery

До production обязательны negative tests:

- автоматическое linking только по совпавшему email запрещено как default;
- recovery challenge replay;
- recovery enumeration;
- recovery rate abuse;
- linking без re-auth/verification policy;
- critical identity change без session rotation/revoke policy.

## 13. ARVELIS CONTROL

Обычная user session не даёт административных прав.

Fail closed:

- frontend role flag;
- hidden URL;
- обычный user cookie без server-side admin authorization;
- попытка вызвать CONTROL action без owner/admin permission;
- stale/revoked admin session;
- dangerous action без требуемого step-up/confirmation/audit policy.

## Merge/backend spike gate

Перед первым реальным auth backend integration:

1. executable v1 contract и server API contract не расходятся;
2. negative scenarios превращены в автоматические backend/integration tests;
3. session/cookie/CSRF topology утверждена;
4. provider callback allowlists/state/PKCE/nonce policy утверждены;
5. rate-limit/recovery/account-linking policy утверждены;
6. data-flow/legal review для production infrastructure выполнен;
7. user auth и ARVELIS CONTROL authorization остаются раздельными security realms/policies.
