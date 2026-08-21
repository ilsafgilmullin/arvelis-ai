# ARVELIS AI — Authorization Foundation

Дата начала: 2026-08-21
Ветка: `feat/auth-foundation-v1`
Статус: product/security/frontend foundation, **без реальной авторизации и backend**.

## Утверждённый app-flow — 2026-08-21

Пользовательский поток приложения зафиксирован:

1. брендовая заставка ARVELIS AI: утверждённый знак → название/lockup;
2. экран `Вход / Регистрация`;
3. после успешного входного шага — существующая Smart Entry с реальными этапами подготовки;
4. после Smart Entry приложение открывает **новый пустой чат**, а не Главную;
5. основная навигация: `Главная · Чат · История · Профиль`;
6. `Главная` — информационно-продуктовый центр;
7. `Чат` — основной рабочий сценарий;
8. `История` — управление диалогами;
9. `Профиль` — профиль, настройки, безопасность и account lifecycle.

Splash — **не loading и не фальшивый progress**. Smart Entry остаётся единственным системным loading-flow и отражает реальные задачи подготовки.

## Цель этапа

Спроектировать вход и account lifecycle до подключения конкретного auth-провайдера, чтобы UI, data model, security и будущая backend-реализация не зависели от случайно выбранного сервиса.

## Текущий frontend preview

Текущий `Вход / Регистрация`:

- не создаёт настоящую учётную запись;
- не создаёт серверную сессию;
- использует только один локальный preview-профиль на browser storage;
- первая регистрация требует валидное отображаемое имя;
- системное имя `Пользователь ARVELIS` зарезервировано и не может быть пользовательским именем;
- повторный вход показывает найденный локальный профиль вместо повторного создания профиля;
- повторная регистрация поверх существующего локального профиля блокируется, чтобы не смешивать два аккаунта в одном localStorage;
- выход из preview-профиля возвращает в app-entry flow без удаления локальной истории;
- изменение имени в Профиле использует ту же domain-валидацию, что и регистрация;
- offline-state явно отделяет локальный preview от будущей сетевой авторизации;
- не запрашивает email, телефон, пароль, OTP, токены или другие секреты;
- не имитирует Google/Apple/Yandex/другие provider login как работающие.

Это **frontend auth foundation**, а не production auth.

## Реализованные auth contracts

`src/auth/contracts.ts` определяет provider-independent frontend port:

- доступные auth methods;
- session restore;
- start auth flow;
- complete challenge;
- sign out;
- revoke session;
- account/session/challenge/failure types.

`src/auth/reducer.ts` задаёт детерминированную auth UI state machine.

`src/auth/presentation.ts` отделяет безопасный пользовательский error copy от сырых backend/provider errors.

`src/auth/AuthStatusPanel.tsx` реализует общие UX-состояния:

- checking session;
- submitting;
- challenge;
- session expired;
- offline;
- rate limited;
- safe error presentation.

Эти состояния доступны во внутреннем QA-screen и **не выдаются за реально работающую серверную авторизацию**.

## Зафиксированные security constraints

- реальные роли и разрешения проверяются сервером;
- секреты и session secrets не хранятся во frontend-коде или localStorage;
- пользовательские данные минимизируются;
- чувствительные данные не попадают в логи без необходимости;
- должны существовать logout/session revoke, account deletion, data export/delete и recovery policy;
- требования к персональным данным и регионам хранения проверяются до публичного запуска;
- frontend не является источником истины для access control;
- ARVELIS CONTROL использует отдельную owner/admin auth boundary и не делит user-session с ARVELIS AI.

## OPEN — решения, которые нельзя придумывать как утверждённые

Перед реальным auth/backend нужно отдельно утвердить:

1. Основной идентификатор входа: email, телефон или комбинация.
2. Нужен ли passwordless flow / magic link / OTP.
3. Допустимы ли внешние identity providers и какие именно с учётом работы в России без VPN.
4. Нужна ли обязательная верификация email/телефона до использования продукта.
5. Возрастные ограничения и требования к согласию/политике конфиденциальности.
6. Production session model и API topology.
7. Уровни доступа/роли — сейчас `OPEN` по `docs/06_MVP_GATES.md`.
8. Account recovery policy.
9. Account deletion/export/retention contract.
10. Anti-abuse controls: rate limiting, credential stuffing protection, suspicious login handling.

## Архитектурные документы текущего этапа

- `docs/20_AUTH_ARCHITECTURE.md` — provider-independent auth architecture candidate;
- `docs/21_AUTH_DATA_MODEL.md` — минимальные Account / Identity / Session / Challenge / Security Event сущности;
- `docs/22_IPHONE_VIDEO_QA_2026-08-21.md` — фактический iPhone video-audit app-entry/auth flow.

## Безопасное направление UI до утверждения backend

Можно разрабатывать и проверять:

- Splash / Sign in / Create account information architecture;
- display name onboarding;
- loading/error/offline/rate-limit/session-expired states;
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

Текущая реализация закрывает source/UI foundation по следующим пунктам:

- provider-independent interface — готов;
- account/session entities candidate — готов;
- auth UI states — определены и имеют reusable component;
- локальная registration/sign-in semantics — разделены;
- shared profile-name validation — готова;
- preview sign-out без удаления данных — готов;
- iPhone first-paint/auth copy проблемы из video-QA — исправлены в коде;
- internal auth-state QA — добавлен.

Остаются фактические runtime gates:

- повторный iPhone smoke после последних изменений;
- Android/desktop smoke;
- repository typecheck/build при доступном runner;
- выбор production auth method/provider/backend — отдельное решение.

## Следующий этап после frontend auth foundation

1. утвердить production identifier/auth method;
2. выбрать backend/session topology и инфраструктуру;
3. подключить реальную server-side auth только после security/privacy review;
4. отдельно пройти Профиль/account-security UX с реальными session capabilities;
5. AI не подключать до закрытия соответствующих MVP gates.
