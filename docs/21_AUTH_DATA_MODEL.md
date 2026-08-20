# ARVELIS AI — Auth Data Model Candidate

Статус: `CANDIDATE`, без выбора production database.
Дата: 2026-08-21.

Этот документ описывает минимальные auth/account сущности. Он не закрывает общий product data-model gate и не утверждает конкретные SQL/NoSQL поля.

## 1. Account

Представляет пользовательский аккаунт ARVELIS AI.

Минимально требуется:

- внутренний immutable account id;
- display name/profile reference;
- account status;
- created/updated timestamps;
- deletion/retention state.

Email/phone/provider id не должны использоваться как вечный внутренний primary key аккаунта.

## 2. Identity

Связывает Account со способом входа.

Нужно поддержать возможность нескольких identity без переписывания Account:

- provider/method id;
- provider subject/external id или canonical identifier;
- verification state;
- linked timestamp;
- last authentication timestamp;
- disabled/unlinked state.

Provider access/refresh tokens, если когда-либо потребуются server-side, не возвращаются в frontend и хранятся по отдельной защищённой policy.

## 3. Session

Отдельная серверная сессия устройства/браузера.

Минимально:

- session id;
- account id;
- created at;
- last seen;
- expires at;
- revoked at / revoke reason;
- coarse device/session metadata, если это необходимо пользователю для управления сессиями;
- security context/version для принудительной инвалидизации после критических изменений.

Frontend не хранит auth session secret в localStorage.

## 4. Auth Challenge

Короткоживущий объект для OTP/magic-link/passkey/external flow, если выбранный метод этого требует.

Требования:

- короткий TTL;
- single-use;
- attempt limits;
- rate limits;
- replay protection;
- привязка к intent/session context;
- секретные значения не хранятся в открытом виде, если их можно проверить через hash/derived value.

## 5. Security Event

Серверное security/audit событие, отдельное от обычной продуктовой аналитики.

Примеры категорий:

- sign-in success/failure;
- challenge requested/failed;
- session created/revoked/expired;
- account recovery;
- identity linked/unlinked;
- suspicious/rate-limit event;
- critical account security change.

Не логировать credential/challenge secrets и лишние персональные данные.

## 6. Consent / Policy Acceptance

Если юридический review требует фиксацию согласий/версий документов, она хранится как отдельная сущность/metadata, а не как случайный boolean в frontend.

## 7. CONTROL separation

ARVELIS CONTROL требует отдельной authorization model.

До утверждения ролей нельзя считать обычный `Account` owner/admin только по frontend-флагу.

Возможные реализации server-side — отдельный admin identity realm или отдельные role/permission assignments — остаются OPEN.

## Identifier normalization

Если будут выбраны email/phone identifiers:

- canonicalization выполняется сервером;
- display form и canonical form разделяются;
- уникальность и linking policy утверждаются отдельно;
- изменение primary identifier требует re-auth/verification policy.

## Recovery / deletion

До production обязательны правила:

- account recovery;
- compromised identity;
- revoke all sessions;
- delete account;
- export/delete user data;
- retention/legal hold, если применимо.

## Не утверждено

- PostgreSQL / Firestore / другая DB;
- auth provider;
- конкретная схема таблиц/коллекций;
- phone/email как primary method;
- roles;
- billing/customer linkage;
- exact retention periods;
- geographic storage region.
