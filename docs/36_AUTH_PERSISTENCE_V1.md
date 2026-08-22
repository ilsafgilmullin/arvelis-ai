# ARVELIS AI — Auth Persistence v1

Дата первоначального решения: 2026-08-21.  
Актуализировано после closed-test E2E: 2026-08-22.  
Ветка: `feat/auth-persistence-v1`.  
Статус: **closed-test implementation verified; не production deploy**.

Финальный audit/gate: `docs/39_AUTH_FINAL_AUDIT.md`.

## Цель

Подключить реальную persistence-границу и server-auth path к Email OTP / Account / Session Core без жёсткой привязки ARVELIS к одному identity/database/email provider.

## Архитектура

Auth domain зависит от внутренних ports/contracts.

Persistence adapter paths:

1. `SQLite` — текущий бесплатный development/closed-test path;
2. `PostgreSQL` — сохранённый replaceable adapter/production candidate, но provider/region не утверждены.

Runtime selector:

- `AUTH_DB_PROVIDER=sqlite` — closed-test default;
- `AUTH_DB_PROVIDER=postgres` — explicit PostgreSQL path.

Browser flow:

`React/Vite → same-origin /api/auth/* → trusted Auth API → Account/OTP/Session services → persistence + SMTP`

## SQLite closed-test path

Default:

```text
AUTH_DB_PROVIDER=sqlite
AUTH_SQLITE_PATH=.data/arvelis-auth.sqlite
```

File-backed SQLite runtime разрешён только внутри `.data/`; `:memory:` используется тестами. `.data/`, SQLite, WAL и SHM исключены из Git и дополнительно закрыты Vite deny rules.

SQLite schema содержит:

- `auth_accounts`;
- `auth_email_identities`;
- `auth_email_otp_challenges`;
- `auth_rate_limits`;
- `auth_sessions`;
- `auth_security_events`;
- `auth_schema_migrations`.

Используются foreign keys, STRICT tables, `BEGIN IMMEDIATE`, WAL для file-backed DB и checksummed migration. При checksum mismatch runtime прекращает запуск.

Важно: локальный Replit filesystem не является production-persistent storage. Этот SQLite path нельзя использовать как production database.

## PostgreSQL adapter

PostgreSQL adapter реализует те же основные domain contracts:

- atomic Account + Email Identity creation;
- unique canonical email;
- transactional OTP lifecycle;
- server-side rate limits;
- server-side Session persistence/revoke/list/touch.

Explicit PostgreSQL path требует protected `DATABASE_URL`. `npm run db:migrate` является PostgreSQL-specific command.

Live PostgreSQL integration в текущем closed-test не был фактически подтверждён; этот path остаётся candidate до отдельного environment test.

## Account data model

Email не является primary key Account.

`auth_accounts` хранит immutable Account ID, display name, status, security version и timestamps. Email identity хранится отдельно и связывается с Account ID.

Утверждённая conflict semantics после успешной OTP verification:

- `sign_up` + email уже связан с Account → `account_exists`;
- `sign_in` + подтверждённый email не связан с Account → `account_not_found`.

До успешной проверки OTP `start` не раскрывает существование Account.

Server-side правила:

- display name повторно валидируется;
- Account/Identity IDs генерируются независимо от email;
- suspended/deleted/pending-deletion Account не получает session;
- disabled Email Identity не может войти;
- raw session secret не выходит за trusted server boundary.

Отдельное OPEN-решение перед массовой регистрацией: case semantics local-part email (`User@…` vs `user@…`).

## Email OTP

Closed-test email delivery:

- generic SMTP adapter;
- Яндекс Почта test mailbox;
- `smtp.yandex.ru:465`;
- SSL/SMTPS;
- TLS minimum `1.2`;
- отдельный Mail app password только в protected Secrets.

Production transactional-email provider остаётся `OPEN`.

OTP properties:

- 6-digit code;
- 10-minute TTL;
- max attempts policy;
- HMAC-SHA256 verifier with independent OTP pepper;
- raw OTP не хранится в БД;
- two-phase delivery lifecycle;
- replacement/supersede;
- replay rejection;
- server-side email/challenge rate limits.

Для public auth дополнительно потребуется trusted client/global abuse protection; closed-test `AUTH_TRUST_PROXY=false` намеренно не доверяет forwarded client identity.

## Session

Session properties:

- random session ID + random secret;
- server хранит только verifier/MAC secret;
- independent Session pepper;
- account security-version binding;
- expiry/revoke/list/touch;
- HttpOnly browser cookie;
- `SameSite=Lax`;
- raw secret не доступен React/localStorage.

Production cookie/proxy policy остаётся отдельным gate. Closed-test `AUTH_COOKIE_SECURE=auto` не считается финальной production policy.

## HTTP/BFF

Auth API предоставляет:

- `GET /api/auth/methods`;
- `GET /api/auth/session`;
- `POST /api/auth/start`;
- `POST /api/auth/complete`;
- `POST /api/auth/sign-out`;
- `GET /api/auth/sessions`;
- `DELETE /api/auth/sessions/:id`;
- `GET /api/health`.

Closed-test API слушает loopback `127.0.0.1:3001`. Browser использует same-origin Vite proxy.

Mutating endpoints используют same-origin/request-marker boundary; JSON body ограничен; auth responses используют `Cache-Control: no-store`.

## Frontend

Реализованы:

- реальный `Вход / Регистрация` Email OTP flow;
- имя + email для sign-up;
- email для sign-in;
- 6-digit OTP confirmation;
- restore protected session after refresh;
- sign out;
- список активных sessions;
- revoke session;
- server Account profile read-only boundary;
- offline/error/auth states;
- account-scoped local demo workspace/drafts.

AI всё ещё не подключён. Диалоги текущего интерфейсного этапа остаются demo/local и не должны выдаваться за server AI history.

## Фактически выполнено 2026-08-22

В Replit + iPhone/Safari подтверждены:

1. TypeScript/auth/SQLite/build checks;
2. SQLite persistence + full auth-flow smoke;
3. auth-server build;
4. frontend production build;
5. SMTP verify + техническая доставка;
6. реальный sign-up;
7. получение OTP;
8. Account creation;
9. HttpOnly server Session;
10. refresh/session restore;
11. `iPhone · Safari` session listing;
12. logout/server revoke;
13. повторный sign-in через новый OTP.

Это заменяет устаревший список «ещё не подключено» из первоначальной версии документа.

## Что остаётся OPEN

Для merge foundation:

- dependency lockfile;
- final current-HEAD check;
- независимый зелёный CI, когда GitHub Actions снова выполняет steps.

Для production/public auth:

- production DB provider/region;
- backups/recovery;
- retention/cleanup;
- security event audit trail;
- trusted proxy/client abuse protection;
- production cookie policy;
- production transactional email;
- account recovery/linking;
- account deletion/export;
- privacy/legal/PII requirements;
- monitoring/alerts;
- финальные roles/permissions;
- email local-part identity semantics.

Подробная severity-классификация и merge decision находятся в `docs/39_AUTH_FINAL_AUDIT.md`.
