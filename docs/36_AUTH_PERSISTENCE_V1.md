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

`auth_accounts` теперь хранит `display_name`, потому что имя является частью уже утверждённого пользовательского onboarding и должно принадлежать server account, а не localStorage-профилю.

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

## Проверки

Добавлен PostgreSQL integration smoke, который проверяет реальные SQL constraints/transactions на временной тестовой PostgreSQL БД.

CI поднимает ephemeral PostgreSQL 18.4 service, выполняет migration, затем persistence smoke.

## Что не подключено этим этапом

- реальный email/SMTP delivery;
- HTTP `/api/auth/*` routes;
- защищённая browser cookie;
- orchestration verified OTP → Account/Session;
- frontend real email/OTP flow;
- production database provider/region;
- account recovery;
- roles/permissions;
- ARVELIS CONTROL auth;
- AI.

## Следующий этап

1. generic SMTP delivery adapter с секретами только из environment;
2. trusted auth application service: verified OTP → sign-in/sign-up Account → Session;
3. same-origin BFF/HTTP adapter + HttpOnly cookie;
4. подключение существующего `AuthGateway` frontend к реальному API;
5. iPhone end-to-end smoke: регистрация → email OTP → сессия → logout/login restore.
