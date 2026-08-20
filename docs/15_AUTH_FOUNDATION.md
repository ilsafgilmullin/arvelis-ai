# ARVELIS AI — Authorization Foundation

Дата начала: 2026-08-21
Ветка: `feat/auth-foundation-v1`
Статус: product/security foundation, **без реальной авторизации и backend**.

## Утверждённый app-flow — 2026-08-21

Пользовательский поток приложения зафиксирован:

1. брендовая заставка ARVELIS AI: утверждённый знак → название/lockup;
2. экран `Вход / Регистрация`;
3. после успешного входного шага — существующая Smart Entry с реальными этапами подготовки;
4. после Smart Entry приложение открывает **новый пустой чат**, а не Главную;
5. основная навигация: `Главная · Чат · История · Профиль`;
6. `Главная` — информационно-продуктовый центр: о проекте, как пользоваться, конфиденциальность/безопасность, статус продукта, полезная информация и быстрый доступ к недавним диалогам;
7. `Чат` — основной рабочий сценарий;
8. `История` — управление локальными/в будущем серверными диалогами;
9. `Профиль` — профиль, настройки, безопасность и account lifecycle.

Splash — **не loading и не фальшивый progress**. Это короткая брендовая заставка. Smart Entry остаётся единственным системным loading-flow и продолжает отражать реальные задачи подготовки.

## Цель этапа

Спроектировать вход и account lifecycle до подключения конкретного auth-провайдера, чтобы UI, data model, security и будущая backend-реализация не зависели от случайно выбранного сервиса.

## Текущий frontend preview

Текущий `Вход / Регистрация`:

- не создаёт настоящую учётную запись;
- не создаёт серверную сессию;
- запрашивает только отображаемое имя для локального preview;
- хранит его только в browser preview;
- не запрашивает email, телефон, пароль, токены или другие секреты;
- явно сообщает пользователю, что защищённая production-авторизация ещё не подключена.

Это **frontend auth foundation**, а не production auth.

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

- Splash / Sign in / Create account information architecture;
- display name onboarding;
- loading/error/offline states;
- form accessibility, keyboard/autofill behavior, touch targets;
- privacy/security explanatory copy;
- account/security screen layout без имитации работающих server sessions.

Нельзя до отдельного решения:

- показывать email/password/OTP/social login как реально работающие;
- хранить пароли или session secrets в localStorage;
- подключать внешний auth provider;
- создавать production user database;
- утверждать роли/permissions;
- считать текущий preview настоящей регистрацией.

## Definition of Done для frontend auth foundation

Этап можно считать готовым к следующему решению, когда:

- Splash → Auth → Smart Entry → New Chat последователен на iPhone/Android/desktop;
- Preview и future production auth визуально/семантически не смешиваются;
- все auth states определены: initial, validation, loading, error, offline, rate-limit, success, session-expired;
- определён future auth interface между frontend и backend без привязки к одному provider;
- определены необходимые account/session сущности на уровне contract, но без преждевременной production schema;
- security/privacy open decisions вынесены отдельно и не маскируются mock-логикой.

## Следующий этап после текущего UI-pass

1. фактическая проверка нового app-entry flow;
2. отдельный проход по `Главной`;
3. отдельный проход по `Профилю` и account/security UX;
4. затем решение по реальному способу авторизации и backend contract;
5. AI не подключается до закрытия соответствующих MVP gates.
