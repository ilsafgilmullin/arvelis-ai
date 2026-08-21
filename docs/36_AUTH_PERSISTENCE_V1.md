# ARVELIS AI — Auth Persistence v1

Дата: 2026-08-21.
Ветка: `feat/auth-persistence-v1`.
Статус: **implementation candidate, не production deploy**.

## Цель

Подключить реальную транзакционную persistence-границу и рабочий server-auth path к уже существующим Email OTP / Account / Session Core без привязки ARVELIS Account к внешнему identity provider или обязательному платному DB-сервису.

## Persistence architecture

Auth domain зависит от внутренних ports/contracts, а не от конкретной БД.

Сейчас существуют два adapter path:

1. `SQLite` — основной бесплатный development/closed-test path;
2. `PostgreSQL` — сохранённый replaceable adapter и production-кандидат, но production provider/region не утверждены.

Runtime выбирает persistence через:

- `AUTH_DB_PROVIDER=sqlite` — default;
- `AUTH_DB_PROVIDER=postgres` — явный PostgreSQL path.

## Бесплатный SQLite test path

По умолчанию auth runtime использует встроенный в Node.js `node:sqlite` и локальный файл:

`AUTH_SQLITE_PATH=.data/arvelis-auth.sqlite`

Для этого закрытого теста не нужен внешний database account, банковская карта или отдельный cloud DB.

SQLite schema создаёт:

- `auth_accounts`;
- `auth_email_identities`;
- `auth_email_otp_challenges`;
- `auth_rate_limits`;
- `auth_sessions`;
- `auth_security_events`;
- `auth_schema_migrations`.

SQLite path использует:

- foreign keys;
- strict tables;
- UNIQUE canonical email;
- `BEGIN IMMEDIATE` для транзакционных auth mutations;
- WAL для file-backed development DB;
- checksum migration `001_auth_foundation`;
- fail-closed при checksum mismatch.

`.data/`, SQLite file и WAL/SHM исключены из Git.

Это только development/closed-test persistence. Локальный filesystem published Replit deployment нельзя считать production-persistent database. Production DB остаётся отдельным решением.

## PostgreSQL adapter

PostgreSQL adapter сохранён и реализует те же domain contracts.

Он поддерживает:

- atomic Account + Email Identity creation;
- DB-level unique canonical email;
- row-locked OTP lifecycle;
- transactional fixed-window rate limits;
- server-side Session persistence/revoke/list/touch.

Explicit PostgreSQL path требует:

`AUTH_DB_PROVIDER=postgres`

и protected:

`DATABASE_URL`.

`npm run db:migrate` остаётся PostgreSQL-specific migration command и не нужен для SQLite closed-test runtime, потому что SQLite checksummed schema применяется idempotent при открытии локальной БД.

## Account data model

Email не является primary key Account.

`auth_accounts` хранит:

- immutable Account ID;
- display name;
- account status;
- security version;
- timestamps.

Email identity хранится отдельно и связывается с Account ID.

Отображаемое имя принадлежит server account, а не только browser `localStorage` preview-профилю.

## Atomic guarantees

Оба persistence adapter path должны сохранять одинаковые auth invariants:

- atomic Account + Email Identity creation;
- unique canonical email conflict;
- two-phase OTP lifecycle `pending → delivered → active`;
- replacement/supersede предыдущего active OTP;
- atomic attempt increment;
- single-use consume/replay rejection;
- transactional server-side rate limits;
- account-scoped session revoke;
- active session list/touch.

## Утверждённая account conflict policy

После успешного подтверждения владения email одноразовым кодом действует следующая семантика:

- `sign_up` + email уже связан с ARVELIS Account → `account_exists`;
- `sign_in` + подтверждённый email ещё не связан с ARVELIS Account → `account_not_found`.

Эти ответы появляются только после успешной OTP verification. `start` не раскрывает существование аккаунта и остаётся enumeration-resistant.

## Trusted Account Auth Application Layer

`server/auth/application/` соединяет:

`Verified Email → Account / Identity → Server Session`.

Правила:

- при регистрации отображаемое имя повторно валидируется server-side;
- зарезервированное системное имя не принимается как пользовательское;
- Account ID и Identity ID генерируются независимо от email;
- создание Account + Identity остаётся атомарным на persistence layer;
- гонка двух регистраций одного email закрывается uniqueness и возвращает `account_exists`;
- suspended/deleted/pending-deletion Account не получает новую session;
- disabled identity не может аутентифицироваться;
- успешный вход обновляет `lastAuthenticatedAt`;
- raw session secret остаётся только внутри trusted server boundary.

## Email delivery — бесплатный test path

Yandex Cloud Postbox был отменён пользователем до активации инфраструктуры. Cloud resource, billing, sender/domain и API credentials не создавались.

Для development/closed testing используется обычная бесплатная Яндекс Почта через generic SMTP adapter:

- host: `smtp.yandex.ru`;
- port: `465`;
- SSL/SMTPS;
- отдельный тестовый mailbox ARVELIS;
- отдельный Mail app password;
- normal Yandex ID password не используется ARVELIS;
- credentials только в protected environment/secrets;
- transport требует TLS `1.2+`.

Production transactional-email provider остаётся `OPEN`.

Email delivery остаётся за `EmailOtpDeliveryPort`, поэтому Account/Session/frontend не зависят от Яндекса.

## Same-origin HTTP/BFF

Server runtime предоставляет:

- `GET /api/auth/methods`;
- `GET /api/auth/session`;
- `POST /api/auth/start`;
- `POST /api/auth/complete`;
- `POST /api/auth/sign-out`;
- `GET /api/auth/sessions`;
- `DELETE /api/auth/sessions/:id`;
- `GET /api/health`.

Browser session хранится в `HttpOnly`, `SameSite=Lax` cookie. Raw session secret не возвращается React-коду и не сохраняется в browser storage.

Mutating endpoints используют same-origin boundary и request marker; auth responses используют `Cache-Control: no-store`.

## Frontend wiring

Подготовлены:

- guarded HTTP auth transport;
- реальный `Вход / Регистрация` flow;
- имя + email для sign-up;
- email для sign-in;
- 6-digit OTP confirmation;
- restore protected session after refresh;
- sign out;
- session management integration candidate в Profile.

Реальный auth остаётся за:

`VITE_REAL_AUTH_ENABLED=false`

до фактического environment/E2E smoke.

## Локальные demo-данные

При real-auth mode локальные demo workspace/drafts изолируются по ARVELIS Account ID, чтобы история одного account на общем browser/device не показывалась другому account.

AI пока не подключён. Chat data по-прежнему demo/local и не должны выдаваться за server AI history.

## Проверки, добавленные в код

Candidate test coverage включает:

- Email OTP Core smoke;
- Session Core smoke;
- Account Auth Application smoke;
- runtime config smoke;
- SQLite persistence smoke;
- PostgreSQL persistence integration smoke;
- frontend/backend TypeScript build commands;
- CI PostgreSQL migration path.

`test:server-sqlite` использует in-memory SQLite и проверяет:

- atomic Account + Identity;
- duplicate email/no partial account;
- OTP replacement/supersede;
- attempt + single-use consume;
- replay rejection;
- rate limit;
- session create/touch/list/revoke;
- migration checksum.

Наличие этих тестов ещё не является доказательством PASS. Hosted GitHub Actions ранее завершал job до первого step, поэтому успешный результат будет зафиксирован только после фактического запуска.

## Zero-cost closed-test stack

Текущий целевой тестовый контур:

`React/Vite → same-origin Auth API → SQLite → Яндекс Почта SMTP`

Отдельный платный DB/email cloud service этому контуру не требуется.

При этом стоимость/лимиты самого Replit account/runtime являются отдельным внешним условием и не относятся к ARVELIS DB/SMTP adapter.

## Что ещё НЕ подключено фактически

- отдельный тестовый Яндекс Почта mailbox;
- Mail app password в protected Replit Secrets;
- независимые production-like OTP/session peppers в Replit Secrets;
- запуск final auth runtime в Replit;
- фактический SQLite persistence smoke в project environment;
- фактическая SMTP доставка OTP;
- `VITE_REAL_AUTH_ENABLED=true`;
- iPhone/Android E2E;
- account recovery/linking;
- финальные roles/permissions;
- production privacy/data-retention policy;
- production DB provider/region/backups;
- production transactional-email provider;
- ARVELIS CONTROL auth;
- AI.

## Следующий gate

1. выполнить repository checks и `test:server-sqlite` в фактической Node environment;
2. создать отдельный бесплатный тестовый Яндекс Почта mailbox;
3. создать Mail app password;
4. добавить SMTP credentials только в protected Replit Secrets;
5. создать два независимых high-entropy pepper для OTP и Session и хранить только в Secrets;
6. запустить auth runtime с SQLite в test Replit environment;
7. проверить `/api/health` и persistence=`sqlite`;
8. проверить реальную доставку OTP;
9. только после этого включить `VITE_REAL_AUTH_ENABLED=true` в test environment;
10. выполнить iPhone E2E: регистрация → email OTP → Account → HttpOnly Session → refresh restore → logout → повторный login;
11. проверить неверный/истёкший OTP, rate limit, existing/unknown account policy;
12. проверить account-scoped local history/drafts и session revoke;
13. только после успешного smoke обсуждать merge PR №21 в `main`.

## Production gate

SQLite closed-test path не утверждает production DB. Перед production необходимо отдельно утвердить persistent storage, регион хранения, backups, retention, privacy/legal requirements и migration strategy.
