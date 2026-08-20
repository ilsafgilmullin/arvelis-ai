# ARVELIS AI — Authorization Foundation

Дата начала: 2026-08-21
Ветка: `feat/auth-foundation-v1`
Статус: product/security foundation, **без реальной авторизации и backend**.

## Цель этапа

Спроектировать вход и account lifecycle до подключения конкретного auth-провайдера, чтобы UI, data model, security и будущая backend-реализация не зависели от случайно выбранного сервиса.

## Что уже есть в `main`

Текущий `Preview Access`:

- запрашивает только отображаемое имя;
- хранит его локально в browser preview;
- не запрашивает email, телефон, пароль, токены или другие секреты;
- явно сообщает, что настоящая учётная запись и реальная авторизация не созданы.

Этот экран является demo/onboarding preview и **не является production auth flow**.

## Зафиксированные security constraints

- реальные роли и разрешения должны проверяться сервером;
- секреты и session secrets не хранятся в frontend-коде;
- пользовательские данные минимизируются;
- чувствительные данные не должны попадать в логи без необходимости;
- должны существовать logout/session revoke, account deletion, data export/delete и recovery policy;
- требования к персональным данным и регионам хранения проверяются до публичного запуска;
- frontend не считается источником истины для access control.

## OPEN — решения, которые нельзя придумывать как утверждённые

Перед реальным auth/backend нужно отдельно утвердить:

1. Основной идентификатор входа: email, телефон или комбинация.
2. Нужен ли passwordless flow / magic link / OTP.
3. Допустимы ли внешние identity providers и какие именно с учётом работы в России без VPN.
4. Нужна ли обязательная верификация email/телефона до использования продукта.
5. Возрастные ограничения и требования к согласию/политике конфиденциальности.
6. Production session model: cookie/session token, rotation, TTL, device sessions, revoke.
7. Уровни доступа/роли — сейчас `OPEN` по `docs/06_MVP_GATES.md`.
8. Account recovery policy.
9. Account deletion/export/retention contract.
10. Anti-abuse controls: rate limiting, credential stuffing protection, suspicious login handling.

## Безопасное направление UI до утверждения backend

Можно разрабатывать и проверять:

- Welcome / Sign in / Create account information architecture;
- display name onboarding;
- loading/error/offline states;
- form accessibility, keyboard/autofill behavior, touch targets;
- privacy/security explanatory copy;
- placeholders для будущих auth methods только если они явно маркированы как design candidate, а не working login;
- account/security screen layout без имитации работающих server sessions.

Нельзя до отдельного решения:

- показывать email/password/OTP/social login как реально работающие;
- хранить пароли или session secrets в localStorage;
- подключать внешний auth provider;
- создавать production user database;
- утверждать роли/permissions;
- считать Preview Access настоящей регистрацией.

## Definition of Done для frontend auth foundation

Этап можно считать готовым к следующему решению, когда:

- входной flow последователен на iPhone/Android/desktop;
- Preview и future production auth визуально/семантически не смешиваются;
- все auth states определены: initial, validation, loading, error, offline, rate-limit, success, session-expired;
- определён future auth interface между frontend и backend без привязки к одному provider;
- определены необходимые account/session сущности на уровне contract, но без преждевременной production schema;
- security/privacy open decisions вынесены отдельно и не маскируются mock-логикой.

## Следующий рабочий шаг

Провести отдельный UX/architecture аудит `WelcomeScreen` + `AuthScreen`, затем переработать их как единый mobile-first onboarding/auth foundation без подключения реальной авторизации.
