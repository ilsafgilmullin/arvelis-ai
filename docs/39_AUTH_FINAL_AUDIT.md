# ARVELIS AI — Auth Final Audit

Дата: 2026-08-22.
Ветка: `feat/auth-persistence-v1`.
PR: `#21 — feat(auth): real Email OTP + free SQLite test foundation`.
Статус: **closed-test E2E подтверждён; PR пока не готов к merge; production/public auth не готов**.

## Область аудита

Проверены:

- Email OTP domain/service/security;
- Account + Email Identity application layer;
- Server Session lifecycle;
- SQLite persistence и migration boundary;
- сохранённый PostgreSQL adapter path;
- SMTP delivery и test smoke;
- HTTP/BFF same-origin boundary;
- cookie/session handling;
- frontend auth transport и runtime guards;
- account-scoped local demo storage;
- Replit runtime/rollout boundary;
- CI и dependency reproducibility;
- secrets exposure в PR diff;
- mobile iPhone auth/profile flow;
- актуальные security advisories для основных runtime/frontend dependencies.

## Фактически подтверждено в Replit/iPhone

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

Это подтверждает **closed-test flow**, но не является production certification.

## Что исправлено во время финального аудита

1. `.replit` возвращён в fail-closed default: обычный `Run` больше не включает real-auth и не отправляет SMTP smoke автоматически. Stable `main` после будущего merge не должен требовать auth Secrets для обычного frontend preview.
2. File-backed SQLite runtime ограничен каталогом `.data/`; `:memory:` оставлен только для тестов. Это исключает случайное размещение auth DB в статически доступной части проекта.
3. Добавлен smoke assertion, что SQLite path вне `.data/` отклоняется.
4. SMTP smoke теперь отдельно классифицирует timeout вместо недостижимой ветки диагностики.
5. Yandex closed-test documentation приведена к реально проверенной SMTP identity и фактически выполненному E2E.
6. Mobile profile action layout исправлен для iPhone и учитывает bottom navigation + safe area.

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
- browser получает только HttpOnly cookie;
- React/localStorage не получают raw session secret.

### HTTP boundary

- Auth API в closed-test слушает только `127.0.0.1:3001`;
- browser работает через same-origin `/api` proxy;
- mutating endpoints требуют first-party request marker + same-origin checks;
- JSON request body ограничен 16 KiB;
- auth responses используют `Cache-Control: no-store`;
- `X-Content-Type-Options: nosniff` установлен для JSON responses;
- внешние backend errors не выдаются клиенту как raw stack/details.

### Persistence

- Account ID не равен email;
- Email Identity хранится отдельно;
- Account + Identity создаются атомарно;
- canonical email защищён UNIQUE constraint;
- SQLite использует foreign keys, STRICT tables, transactions, WAL и checksummed migration;
- `.data/`, SQLite/WAL/SHM исключены из Git;
- Vite deny layer блокирует `.data/**` и SQLite-файлы;
- PostgreSQL остаётся replaceable adapter, а не жёсткой зависимостью domain layer.

## Pre-merge blockers PR #21

### BLOCKER M1 — dependency lockfile отсутствует

`package.json` добавляет runtime dependencies (`nodemailer`, `pg`) и новые type packages, но `package-lock.json` отсутствует и в `main`, и в feature branch.

Риск:

- installation не полностью воспроизводим;
- transitive versions могут измениться между Run/CI;
- невозможно безопасно перейти на `npm ci`;
- хуже supply-chain auditability.

До merge необходимо создать и commit `package-lock.json` из текущего `package.json`, после чего перевести CI/стабильный install path на `npm ci`.

### BLOCKER M2 — текущий HEAD не имеет независимого зелёного CI

GitHub Actions для последних commits завершает `validate` до появления step execution data (`steps=null`). Это не доказывает ошибку кода, но означает отсутствие независимого CI evidence.

После последних audit-fixes нужен новый фактический `npm run check` в Replit environment. Если GitHub Actions восстановится, требуется также зелёный CI run.

## Production/public-auth blockers

Эти пункты **не блокируют merge auth foundation за выключенным rollout flag**, но блокируют публичную регистрацию/production:

### P1 — persistent production DB / backup / recovery

Локальный Replit SQLite — только development/closed-test. Нужны production persistent storage, регион хранения, backup, restore test и migration strategy.

### P1 — abuse protection при публичной OTP-отправке

Closed-test использует `AUTH_TRUST_PROXY=false`. Поэтому client/IP-derived rate-limit key намеренно не доверяется и per-client limiter фактически не используется. Email/challenge limits работают, но для публичного endpoint этого недостаточно.

До public auth нужен проверенный trusted-proxy/client-IP boundary либо другой server-side global/device abuse throttle, а также send-volume protection.

### P1 — retention / cleanup

Нет утверждённого cleanup lifecycle для:

- expired/consumed/superseded OTP challenges;
- expired rate-limit rows;
- expired/revoked sessions;
- security events.

До production необходимы retention periods и cleanup mechanism.

### P1 — security audit log фактически не подключён

Таблица `auth_security_events` существует, но runtime пока не записывает значимые auth/security events. Нужна безопасная audit trail policy без raw OTP/session/email leakage.

### P1 — production cookie/proxy policy

Closed-test `AUTH_COOKIE_SECURE=auto` подходит для текущего loopback + Replit proxy test, но production должен иметь явно утверждённую HTTPS/proxy trust model. Рекомендуемый production baseline: Secure-only cookie policy за проверенным reverse proxy; отдельно рассмотреть `__Host-` cookie naming.

### P1 — account/email identity case semantics

Текущая normalizer canonicalizes domain case, но сохраняет case local-part. Это означает, что `User@example.com` и `user@example.com` потенциально могут стать разными Account identities на case-sensitive storage.

Нужно отдельное продуктовое/data-model решение до массовой регистрации: case-insensitive account key для consumer email либо явно документированная и DB-enforced альтернативная политика. Нельзя менять семантику молча после появления пользователей.

### P1 — account lifecycle/privacy/legal

Ещё не реализованы/не утверждены:

- account deletion;
- export;
- recovery/linking;
- retention/privacy policy;
- требования к персональным данным и региону хранения;
- публичные legal documents.

### P1 — production transactional email

Обычная Яндекс Почта утверждена только для closed-test. Нужен production mail provider/operational policy с лимитами, bounce/abuse handling и мониторингом.

### P1 — monitoring/alerts

Нет production monitoring/alerting для auth API, DB, SMTP delivery failures, abnormal OTP volume и session/security events.

## Medium technical debt

- PostgreSQL adapter сохранён, но live PostgreSQL integration smoke в этой сессии не подтверждён; CI job запускается только вручную и текущая GitHub Actions infrastructure не дала usable run.
- SQLite schema требует `security_version >= 1`, PostgreSQL migration допускает `>= 0`; создание использует `1`, но provider parity следует унифицировать до production provider switch.
- SQLite active OTP index не UNIQUE, тогда как PostgreSQL имеет partial UNIQUE active index; текущая SQLite transaction serialization/store logic сохраняет invariant, но schema parity стоит усилить.
- Account display-name update endpoint отсутствует; server profile корректно read-only.

## Dependency/advisory review

Проверены актуальные известные advisories на дату аудита:

- Vite `8.2.1` находится выше исправленной версии `8.0.16` для high-severity `server.fs.deny` Windows bypass, затрагивавшего `8.0.0–8.0.15`.
- Nodemailer `9.0.5` находится выше `9.0.1`, где исправлен high-severity raw-message file-read/SSRF bypass для `<=9.0.0`. ARVELIS также не принимает от пользователя Nodemailer `raw`, attachment path/href или message object.
- React `19.2.8` соответствует patched line для июльского 2026 RSC Server Functions DoS advisory, затрагивавшего RSC packages до `19.2.7`; ARVELIS frontend при этом обычный Vite client и не использует RSC server functions.
- В этом audit search не найден блокирующий advisory, специфичный для используемого `pg 8.23.0`; это не заменяет automated dependency scanning после появления lockfile.

## Secret review

В PR diff вручную проверены auth-related configuration, scripts, docs и runtime files.

Не обнаружены реальные:

- SMTP app password;
- OTP pepper;
- Session pepper;
- `DATABASE_URL` production credential;
- API tokens/keys.

В репозитории присутствуют только placeholders и test/CI fixture credentials. Формальный secret scanner (например gitleaks) в текущем CI не выполнялся, поэтому этот пункт является manual review, а не SAST/secret-scan certification.

## Решение аудита

### Closed-test

**PASS с оговорками:** реальный Email OTP + Account + SQLite + HttpOnly Session flow фактически работает на iPhone/Safari.

### Merge PR #21

**NOT READY пока не закрыты M1 и M2:**

1. commit dependency lockfile;
2. фактически выполнить final `npm run check` на текущем audit HEAD;
3. затем перевести install/CI на `npm ci` и проверить повторно.

PR должен оставаться Draft до выполнения этих пунктов.

### Production/public registration

**NOT READY.** Production blockers перечислены выше и соответствуют отдельным этапам Technical Foundation → Closed Beta → Production.

## Rollback

Merge не выполнялся. Production deploy не выполнялся. Основной rollback до merge — не сливать PR #21 и оставить `main` на текущем стабильном состоянии. Для уже созданной test SQLite БД любые destructive migration/data операции запрещены без отдельного backup/approval.
