# ARVELIS AI — бесплатная SQLite БД для test/auth

Дата: 2026-08-21.
Ветка: `feat/auth-persistence-v1`.
Статус: **development / closed-test only, не production DB**.

## Решение

Для текущего этапа реальной регистрации не требуется внешний платный PostgreSQL-сервис.

По умолчанию auth runtime использует встроенный в Node.js `node:sqlite` и локальный файл:

`AUTH_DB_PROVIDER=sqlite`

`AUTH_SQLITE_PATH=.data/arvelis-auth.sqlite`

Это позволяет проверить полный server-authoritative auth flow без отдельного DB account, банковской карты или платного cloud database.

PostgreSQL adapter не удалён. Он остаётся заменяемым production-кандидатом и включается только явным:

`AUTH_DB_PROVIDER=postgres`

## Почему это допустимо сейчас

Текущий gate — закрытое тестирование регистрации на Replit development environment, а не публичный production deployment.

SQLite предоставляет необходимые для этого этапа свойства:

- UNIQUE constraint для canonical email;
- транзакции для Account + Identity creation;
- atomic OTP replacement / attempt / consume;
- server-side rate-limit persistence;
- server-side session persistence;
- foreign keys;
- WAL для локальной file-backed БД;
- отсутствие внешнего DB provider.

## Ограничение

Replit published app filesystem не является persistent storage. Поэтому этот SQLite path предназначен только для development/closed testing в workspace.

Публиковать production ARVELIS с пользовательскими аккаунтами на локальном SQLite-файле Replit нельзя. Перед production потребуется отдельное решение по persistent DB, региону хранения, backups, персональным данным и миграции.

## Схема

SQLite runtime создаёт idempotent/checksummed migration `001_auth_foundation` и таблицы:

- `auth_accounts`;
- `auth_email_identities`;
- `auth_email_otp_challenges`;
- `auth_rate_limits`;
- `auth_sessions`;
- `auth_security_events`;
- `auth_schema_migrations`.

При несовпадении checksum уже применённой migration runtime прекращает запуск вместо тихого изменения схемы.

## Безопасность локального файла

`.data/`, `*.sqlite`, `*.sqlite-wal` и `*.sqlite-shm` исключены из Git.

БД нельзя:

- коммитить в GitHub;
- отправлять в чат;
- прикладывать к публичным issue/PR;
- использовать как production backup.

OTP raw code и raw session secret в SQLite не сохраняются. Сохраняются только защищённые MAC/verifier значения в соответствии с существующим Auth Core.

## Бесплатный test stack

Текущий закрытый тестовый контур:

`React/Vite → same-origin Auth API → SQLite → обычная Яндекс Почта SMTP`

Для email используется отдельный бесплатный mailbox и отдельный Mail app password. SMTP secret хранится только в protected Replit Secrets/environment.

## Rollout gate

До переключения `VITE_REAL_AUTH_ENABLED=true` необходимо фактически выполнить:

1. repository TypeScript/build checks;
2. `test:server-sqlite`;
3. запуск Auth API с SQLite;
4. SMTP delivery smoke на отдельный тестовый mailbox;
5. регистрация нового пользователя;
6. повторный вход существующего пользователя;
7. refresh/session restore;
8. logout/session revoke;
9. неверный и истёкший OTP;
10. проверка account-scoped local history/drafts на общем iPhone.

Только после этого real-auth можно включить в тестовом Replit preview.

## Production остаётся OPEN

Это решение не утверждает:

- production database provider;
- production hosting;
- production email provider;
- retention/backups;
- публичный запуск;
- merge PR №21;
- ARVELIS CONTROL auth.
