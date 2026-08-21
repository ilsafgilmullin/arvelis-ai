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

Email/provider id не используются как вечный внутренний primary key аккаунта.

## 2. Identity

Связывает Account со способом входа.

Первый базовый identity method уже утверждён отдельно:

`email_otp` — email + одноразовый код без постоянного пароля.

Модель должна поддерживать возможность нескольких identity без переписывания Account:

- provider/method id;
- provider subject/external id или canonical identifier;
- verification state;
- linked timestamp;
- last authentication timestamp;
- disabled/unlinked state.

Yandex ID / VK ID / Apple / Google могут позднее подключаться как дополнительные external identities, но не являются обязательным Account primary key.

Provider access/refresh tokens, если когда-либо потребуются server-side, не возвращаются в frontend и хранятся по отдельной защищённой policy.

## 3. Session

Отдельная серверная сессия устройства/браузера.

Текущий server foundation candidate использует:

- отдельный random session id;
- отдельный opaque session secret;
- persistence хранит только verifier/MAC, а не raw secret;
- account `securityVersion` для принудительной инвалидизации старых sessions.

Минимально требуется:

- session id;
- account id;
- created at;
- last seen;
- expires at;
- revoked at / revoke reason;
- coarse device/session metadata, если это необходимо пользователю для управления сессиями;
- security context/version для принудительной инвалидизации после критических изменений.

Frontend не хранит auth session secret в localStorage.

Точный cookie format, session persistence backend, TTL/retention и CSRF topology остаются OPEN.

## 4. Auth Challenge

Для утверждённого `email_otp` используется короткоживущий single-use challenge.

Текущий server foundation требует:

- короткий TTL;
- single-use;
- attempt limits;
- rate limits;
- replay protection;
- двухфазную активацию после подтверждённой email-delivery;
- HMAC verifier вместо хранения raw OTP;
- привязку verifier к challenge id + email.

Raw OTP не хранится и не возвращается frontend.

Другие challenge types для external IdP/passkeys остаются отдельными будущими решениями.

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

Не логировать credential/challenge/session secrets и лишние персональные данные.

## 6. Consent / Policy Acceptance

Если юридический review требует фиксацию согласий/версий документов, она хранится как отдельная сущность/metadata, а не как случайный boolean в frontend.

## 7. CONTROL separation

ARVELIS CONTROL требует отдельной authorization model.

До утверждения ролей нельзя считать обычный Account owner/admin только по frontend-флагу.

Возможные реализации server-side — отдельный admin identity realm или отдельные role/permission assignments — остаются OPEN.

## Email identifier semantics

Для первого auth method email canonicalization выполняется server-side.

Текущий foundation candidate:

- поддерживает bounded ASCII mailbox identifiers;
- lower-case только domain;
- сохраняет local-part case;
- отклоняет управляющие символы и внешние пробелы.

Остаются OPEN:

- exact uniqueness/case policy для local-part;
- duplicate/linking semantics;
- email-change flow;
- internationalized email (SMTPUTF8/EAI).

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
- конкретная схема таблиц/коллекций;
- backend framework/runtime topology;
- production email delivery provider;
- exact sign_up/sign_in conflict UX;
- external identity providers;
- roles;
- billing/customer linkage;
- exact retention periods;
- geographic storage region;
- production cookie/CSRF topology.
