# ARVELIS AI — Auth Final Audit

Дата: 2026-08-22.
Ветка: `feat/auth-persistence-v1`.
PR: `#21 — feat(auth): real Email OTP + free SQLite test foundation`.
Статус: **pre-merge audit PASS / READY FOR MERGE; production/public auth NOT READY**.

## Область аудита

Проверены:

- Email OTP domain/service/security;
- Account + Email Identity application layer;
- Server Session lifecycle;
- SQLite persistence и migration boundary;
- PostgreSQL adapter + migration path;
- SMTP delivery и test smoke;
- HTTP/BFF same-origin boundary;
- cookie/session handling;
- frontend auth transport и runtime guards;
- account-scoped local demo storage;
- Replit runtime/rollout boundary;
- CI и dependency reproducibility;
- dependency audit;
- secrets exposure в PR diff;
- mobile iPhone auth/profile flow.

## Фактически подтверждено

В закрытом test-контуре фактически прошли:

- TypeScript typecheck;
- Auth Core smoke;
- Email OTP Core smoke;
- Server Session Core smoke;
- Account Auth Application smoke;
- SQLite persistence smoke;
- SQLite full auth-flow smoke;
- auth-server build;
- frontend production build;
- SMTP verify + техническое письмо;
- реальная регистрация по email;
- реальный 6-значный OTP;
- создание Account в SQLite;
- server-issued HttpOnly session;
- refresh/session restore без повторного OTP;
- отображение текущей `iPhone · Safari` session;
- logout с server revoke;
- повторный sign-in через новый OTP.

Дополнительно GitHub Actions на code HEAD `5e26a254cc92598f208b75be3dc1fb8c6e8125bd` выполнил:

- reproducible install через committed `package-lock.json` / `npm ci`;
- `npm audit --audit-level=high` — PASS;
- полный validate pipeline — PASS;
- PostgreSQL 18.4 service startup — PASS;
- PostgreSQL auth migration — PASS;
- PostgreSQL persistence smoke — PASS.

Это подтверждает **merge-ready technical foundation**, но не является production certification.

## Что исправлено во время финального аудита

1. Обычный Replit `Run` возвращён в fail-closed frontend default: real-auth и SMTP smoke не запускаются автоматически.
2. `package-lock.json` сгенерирован штатным npm resolution и закоммичен; lockfile version 3.
3. Replit и CI переведены на reproducible `npm ci`.
4. CI снова работает с `contents: read`; временное write-разрешение использовалось только для автоматического bootstrap lockfile и удалено до merge.
5. В CI добавлен dependency audit с блокировкой high/critical npm advisories.
6. PostgreSQL compatibility job переведён в обязательную проверку pull request и фактически прошёл.
7. File-backed SQLite runtime ограничен каталогом `.data/`; `:memory:` разрешён только для test path.
8. Добавлен smoke assertion на отклонение SQLite path вне `.data/`.
9. SMTP smoke исправлен: timeout имеет отдельную достижимую классификацию.
10. Yandex closed-test documentation приведена к реально проверенному SMTP/E2E состоянию.
11. Mobile profile action layout исправлен для iPhone с учётом bottom navigation и safe area.

## Сильные стороны текущей реализации

### OTP

- 6 цифр, TTL 10 минут, максимум 5 попыток;
- криптографическая генерация через Web Crypto;
- raw OTP не хранится в БД;
- HMAC-SHA256 с отдельным OTP pepper;
- pending → delivered → active lifecycle;
- предыдущий active challenge заменяется только после успешной доставки нового;
- single-use consume и replay rejection;
- email/challenge rate limits сохраняются server-side;
- существование Account не раскрывается до подтверждения владения email.

### Session

- 128-bit random session ID + 256-bit random secret;
- raw session secret не сохраняется server-side;
- HMAC-SHA256 с отдельным Session pepper;
- OTP и Session peppers обязаны различаться;
- session bound to Account security version;
- suspended/disabled Account не проходит authentication;
- revoke/list/touch account-scoped;
- browser получает HttpOnly cookie;
- React/localStorage не получают raw session secret.

### HTTP boundary

- Auth API в closed-test слушает только `127.0.0.1:3001`;
- browser работает через same-origin `/api` proxy;
- mutating endpoints требуют first-party request marker + same-origin checks;
- JSON request body ограничен 16 KiB;
- auth responses используют `Cache-Control: no-store`;
- `X-Content-Type-Options: nosniff` установлен для JSON responses;
- backend errors не выдаются клиенту как raw stack/details.

### Persistence

- Account ID не равен email;
- Email Identity хранится отдельно;
- Account + Identity создаются атомарно;
- canonical email защищён UNIQUE constraint;
- SQLite использует foreign keys, STRICT tables, transactions, WAL и checksummed migration;
- `.data/`, SQLite/WAL/SHM исключены из Git;
- Vite deny layer блокирует `.data/**` и SQLite-файлы;
- PostgreSQL остаётся replaceable adapter и теперь имеет фактически зелёный migration/persistence CI smoke.

## Pre-merge gates PR #21 — CLOSED

### M1 — dependency reproducibility

**CLOSED.** `package-lock.json` закоммичен. Корневые runtime/dev dependency versions совпадают с `package.json`. CI и Replit используют `npm ci`.

### M2 — independent current-HEAD checks

**CLOSED.** GitHub runner фактически выполнил все steps. `validate` и `postgres-compat` завершились `success`; dependency audit, typecheck, auth/SQLite smoke, server build, frontend build, PostgreSQL migration и PostgreSQL persistence smoke прошли.

### Review state

Перед merge требуется последняя механическая проверка PR state/review threads/comments и mergeability. Новое функциональное изменение после зелёного code-head не допускается без повторного CI.

## Production/public-auth blockers

Эти пункты **не блокируют merge auth foundation при выключенном rollout flag**, но блокируют публичную регистрацию/production:

1. Production persistent DB, регион хранения, backup/restore и migration strategy.
2. Проверенный trusted-proxy/client-IP boundary или другой global/device abuse throttle для публичной OTP-отправки.
3. Retention/cleanup для expired/consumed OTP, rate-limit rows, expired/revoked sessions и audit events.
4. Фактическая запись security audit events; таблица уже существует, runtime writer ещё не подключён.
5. Production HTTPS/proxy/cookie policy; отдельно рассмотреть Secure-only и `__Host-` cookie naming.
6. Решение по email local-part case semantics до массовой регистрации.
7. Account recovery/linking, deletion/export, privacy/retention policy и legal requirements.
8. Production transactional email provider и operational limits/bounce/abuse handling.
9. Monitoring/alerts для auth API, DB, SMTP failures, abnormal OTP volume и session/security events.
10. ARVELIS CONTROL owner/admin auth остаётся отдельным security realm и этим PR не подключается.

## Medium technical debt

- SQLite schema требует `security_version >= 1`, PostgreSQL migration допускает `>= 0`; создание использует `1`, но provider parity следует унифицировать до production provider switch.
- SQLite active OTP index не UNIQUE, тогда как PostgreSQL имеет partial UNIQUE active index; текущая SQLite transaction serialization/store logic сохраняет invariant, но schema parity следует усилить отдельной backward-safe migration.
- Account display-name update endpoint отсутствует; server profile намеренно read-only.
- Formal secret scanner/SAST пока не встроен в CI; текущая проверка секретов — manual review.

## Dependency/security review

- Committed lockfile делает transitive dependency set воспроизводимым.
- `npm audit --audit-level=high` на pre-merge code HEAD завершился PASS.
- Vite `8.2.1`, Nodemailer `9.0.5`, React `19.2.8` находятся на исправленных линиях относительно известных advisories, проверенных в ходе аудита.
- В PR diff не обнаружены реальные SMTP app password, OTP/session pepper, production `DATABASE_URL`, API token/key. В репозитории используются placeholders и CI fixtures.

## Решение аудита

### Closed-test

**PASS.** Реальный Email OTP + Account + SQLite + HttpOnly Session flow фактически работает на iPhone/Safari.

### Merge PR #21

**READY FOR MERGE**, если последняя механическая проверка PR подтверждает:

- head/base не изменились неожиданно;
- PR mergeable;
- нет unresolved review threads/comments;
- финальный docs-only commit не внёс функциональных изменений.

Merge разрешает перенос foundation в `main`, но real-auth rollout остаётся fail-closed и не включается автоматически.

### Production/public registration

**NOT READY.** Публичный auth и production deployment требуют отдельного этапа и отдельного подтверждения.

## Rollback boundary

До merge rollback — не сливать PR. После merge безопасный operational baseline остаётся прежним: обычный frontend Run не включает real-auth. Production deploy, production DB migration и production secret changes этим audit/merge не разрешаются.
