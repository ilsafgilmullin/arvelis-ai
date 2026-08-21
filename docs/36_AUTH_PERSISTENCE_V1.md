# ARVELIS AI — Auth Persistence v1

Дата: 2026-08-21.
Ветка: `feat/auth-persistence-v1`.
Статус: **implementation candidate, не production deploy**.

## Цель

Подключить реальную транзакционную persistence-границу и рабочий server-auth path к уже существующим Email OTP / Account / Session Core без привязки ARVELIS Account к внешнему identity provider.

## Persistence candidate

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

- требует `DATABASE_URL` только из protected environment;
- не печатает connection string;
- использует advisory transaction lock;
- хранит SHA-256 checksum применённой migration;
- повторный запуск idempotent;
- checksum mismatch прекращает работу вместо тихого переписывания истории схемы.

Миграция не запускается автоматически при обычном frontend `Run` и не применяется к production без отдельного решения.

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
- гонка двух регистраций одного email закрывается DB uniqueness и возвращает `account_exists`;
- suspended/deleted/pending-deletion Account не получает новую session;
- disabled identity не может аутентифицироваться;
- успешный вход обновляет `lastAuthenticatedAt`;
- raw session secret остаётся только внутри trusted server boundary.

## Email delivery — бесплатный test path

Решение Yandex Cloud Postbox отменено до активации инфраструктуры. Ни cloud resource, ни billing, ни sender/domain, ни API credentials не создавались.

Для закрытого тестирования используется **обычная бесплатная Яндекс Почта через generic SMTP adapter**:

- SMTP host: `smtp.yandex.ru`;
- основной тестовый режим: port `465` + SSL/SMTPS;
- username: отдельный тестовый почтовый ящик ARVELIS;
- password: отдельный пароль приложения типа «Почта»;
- sender: тот же тестовый почтовый ящик;
- transport требует TLS `1.2+`.

Отдельный домен, Yandex Cloud billing account и платный transactional-email сервис для этого тестового этапа не требуются.

Важно: обычная Яндекс Почта утверждена только для разработки/закрытого тестирования. Production transactional-email provider остаётся `OPEN` и будет выбран отдельно перед публичным запуском.

Архитектурно email delivery по-прежнему подключён через generic `EmailOtpDeliveryPort` / SMTP adapter, поэтому Account/Session/frontend не зависят от Яндекса.

## Same-origin HTTP/BFF

Добавлен server runtime для `/api/auth/*`:

- auth methods;
- restore session;
- start email OTP;
- complete OTP + Account/Session orchestration;
- sign out;
- list sessions;
- revoke owned session.

Browser session хранится в `HttpOnly`, `SameSite=Lax` cookie. Raw session secret не возвращается React-коду и не сохраняется в browser storage.

Mutating auth endpoints требуют same-origin request boundary и внутренний request marker; auth responses используют `Cache-Control: no-store`.

## Frontend wiring

Добавлены:

- guarded HTTP auth transport;
- реальный `Вход / Регистрация` flow;
- имя + email для sign-up;
- email для sign-in;
- 6-digit OTP confirmation;
- restore protected session after refresh;
- sign out;
- session management integration candidate в Profile.

Реальный auth остаётся за `VITE_REAL_AUTH_ENABLED=false`, пока инфраструктура и E2E не подтверждены. Это предотвращает выдачу незавершённого backend за работающий production auth.

## Локальные preview-данные

При real-auth mode локальные demo workspace/drafts изолируются по ARVELIS Account ID, чтобы история одного аккаунта на общем устройстве не показывалась другому аккаунту.

AI по-прежнему не подключён; chat data остаются demo/local и должны продолжать маркироваться честно.

## Проверки, добавленные в код

- Email OTP Core smoke;
- Session Core smoke;
- Account Auth Application smoke;
- PostgreSQL persistence integration smoke;
- runtime config smoke для generic SMTP;
- TypeScript frontend/backend build commands;
- CI PostgreSQL service + migration path.

На текущий момент GitHub Actions остаётся инфраструктурно ненадёжным и завершает job до первого step. Поэтому наличие тестов не считается фактическим успешным прогоном до появления реального run с выполненными steps или отдельного локального/Replit запуска.

## Что ещё НЕ подключено фактически

- отдельный тестовый Яндекс Почта sender mailbox;
- пароль приложения для SMTP;
- реальная PostgreSQL instance/production region;
- фактическое применение migration к рабочей БД;
- production secrets;
- включение `VITE_REAL_AUTH_ENABLED=true`;
- iPhone/Android E2E;
- account recovery/linking;
- финальные роли/permissions;
- production privacy/data-retention policy;
- production transactional-email provider;
- ARVELIS CONTROL auth;
- AI.

## Следующий gate

1. создать отдельный бесплатный тестовый Яндекс Почта mailbox для ARVELIS;
2. создать для него отдельный пароль приложения типа «Почта»;
3. сохранить SMTP credentials только в protected Replit secrets;
4. подготовить PostgreSQL instance для тестовой auth environment без подключения платного production-сервиса;
5. создать independent OTP/session peppers;
6. выполнить migration в тестовой DB;
7. запустить `npm run check:with-db` в фактической среде;
8. проверить реальную доставку OTP через Яндекс Почту;
9. включить real-auth только в test/Replit environment;
10. выполнить iPhone E2E: регистрация → email OTP → session → refresh restore → logout → повторный login;
11. проверить account isolation и session revoke;
12. только после успешного smoke обсуждать merge PR №21 в `main`.
