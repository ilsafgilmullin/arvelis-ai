# ARVELIS AI — Auth Persistence v1

Дата: 2026-08-21.
Ветка: `feat/auth-persistence-v1`.
Статус: **implementation candidate, не production deploy**.

## Цель

Подключить реальную транзакционную persistence-границу к уже существующим Email OTP / Account / Session Core без привязки ARVELIS Account к внешнему identity provider.

## Выбранный технический кандидат

Для auth persistence используется PostgreSQL через `pg` adapter.

Причины:

- транзакции и row locking нужны для atomic OTP lifecycle;
- уникальность email identity обеспечивается на уровне БД;
- account + identity создаются одной транзакцией;
- session revoke/list/touch выполняются server-side;
- слой adapter остаётся отделён от auth domain contracts;
- конкретный production hosting provider этим решением не утверждается.

## Схема

Migration `001_auth_foundation.sql` создаёт:

- `auth_accounts`;
- `auth_email_identities`;
- `auth_email_otp_challenges`;
- `auth_rate_limits`;
- `auth_sessions`;
- `auth_security_events`;
- индексы и ограничения целостности.

Email не является primary key Account.

`auth_accounts` хранит `display_name`, потому что имя является частью утверждённого пользовательского onboarding и должно принадлежать server account, а не localStorage-профилю.

## Atomic guarantees

PostgreSQL adapters реализуют:

- atomic Account + Email Identity creation;
- unique canonical email conflict;
- two-phase OTP challenge activation;
- replacement/supersede предыдущего active OTP;
- row-locked attempt increment;
- single-use consume;
- transactional fixed-window rate limits;
- account-scoped session revoke;
- server-side session list/touch.

## Миграции

`npm run db:migrate`:

- требует только `DATABASE_URL` из protected environment;
- не печатает connection string;
- использует advisory transaction lock;
- хранит SHA-256 checksum применённой migration;
- повторный запуск idempotent;
- checksum mismatch прекращает работу вместо тихого переписывания истории схемы.

Миграция не запускается автоматически при `Run` и не применяется к production без отдельного решения.

## Утверждённая account conflict policy — 2026-08-21

После успешного подтверждения владения email одноразовым кодом действует следующая семантика:

- `sign_up` + email уже связан с ARVELIS Account → `account_exists`;
- `sign_in` + подтверждённый email ещё не связан с ARVELIS Account → `account_not_found`.

Эти ответы появляются только после успешной OTP verification. `start` не раскрывает существование аккаунта и остаётся enumeration-resistant.

## Trusted Account Auth Application Layer

Добавлен отдельный слой:

`server/auth/application/`

Он потребляет только внутренний `VerifiedEmailOtpProof` и соединяет:

`Verified Email → Account / Identity → Server Session`.

Правила:

- при регистрации отображаемое имя повторно валидируется server-side;
- зарезервированное системное имя не принимается как пользовательское;
- Account ID и Identity ID генерируются независимо от email;
- создание Account + Identity остаётся атомарным на persistence layer;
- гонка двух регистраций одного email закрывается DB uniqueness и возвращает `account_exists`;
- suspended/deleted/pending-deletion Account не получает новую session;
- disabled identity не может аутентифицироваться;
- успешный вход обновляет `lastAuthenticatedAt`;
- raw session secret остаётся только во внутреннем результате для будущего HTTP/BFF cookie adapter.

## Проверки

Добавлен PostgreSQL integration smoke, который проверяет реальные SQL constraints/transactions на временной тестовой PostgreSQL БД.

CI поднимает ephemeral PostgreSQL 18.4 service, выполняет migration, затем persistence smoke.

Дополнительно `account-auth-application-smoke` проверяет утверждённую sign-up/sign-in policy, нормализацию имени, блокировку suspended/disabled identity и выдачу session только после успешного account resolution.

## Что не подключено этим этапом

- реальный email/SMTP delivery;
- HTTP `/api/auth/*` routes;
- защищённая browser cookie;
- frontend real email/OTP flow;
- production database provider/region;
- account recovery;
- роли/permissions;
- ARVELIS CONTROL auth;
- AI.

## Следующий этап

1. generic SMTP delivery adapter с секретами только из environment;
2. same-origin BFF/HTTP adapter + HttpOnly cookie;
3. подключение существующего `AuthGateway` frontend к реальному API;
4. account-scoped local demo workspace, чтобы локальная история одного аккаунта не показывалась другому пользователю на общем устройстве;
5. iPhone end-to-end smoke: регистрация → email OTP → сессия → logout/login restore.
