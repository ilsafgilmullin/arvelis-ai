# ARVELIS AI — App Experience v1

Статус: `APPROVED FLOW / FRONTEND PREVIEW`.
Дата: 2026-08-21.
Ветка реализации: `feat/auth-foundation-v1`.

## Утверждённая последовательность запуска

`Splash → Вход/Регистрация → Smart Entry → Новый чат`

### Splash

- используется утверждённый ARVELIS AI brand lockup;
- это короткая брендовая заставка, а не системная загрузка;
- не показывает выдуманный progress;
- safe-area compatible на iPhone/Android;
- reduced-motion respected.

### Вход / Регистрация

- информационная архитектура разделяет `Вход` и `Регистрация`;
- до backend экран работает только как локальный preview-access;
- email/password/OTP/social login не имитируются как рабочие;
- секреты и session credentials не хранятся в browser storage;
- реальный auth method остаётся OPEN до отдельного решения.

### Smart Entry

- сохраняется существующая модель реального progress;
- stages отражают фактическую подготовку интерфейса, Chat и локальных данных;
- fake timer/progress запрещён;
- error/retry остаются обязательными.

### Post-auth destination

После Smart Entry пользователь попадает в **новый пустой Chat** (`activeThreadId = null`).

Главная не является обязательным промежуточным экраном после входа.

## Основная навигация

Четыре постоянных раздела:

1. `Главная`
2. `Чат`
3. `История`
4. `Профиль`

Desktop sidebar сохраняет ту же продуктовую иерархию. Mobile использует нижнюю навигацию с safe-area clearance и touch targets.

## Роль Главной

Главная больше не дублирует Chat composer.

Она содержит:

- позиционирование ARVELIS AI;
- информацию о проекте;
- краткое объяснение, как пользоваться продуктом;
- privacy/security status;
- текущий статус версии;
- CTA `Новый чат`;
- быстрый доступ к недавним диалогам.

## Роль Chat

Chat — основной рабочий экран продукта.

Текущий preview сохраняет:

- новый/существующий диалог;
- локальные drafts;
- history transitions;
- edit/rename/delete/search/copy;
- честные PREVIEW/MOCK disclosure;
- mobile bounded visualViewport architecture.

## Роль Истории

История отвечает за поиск, открытие и удаление диалогов. Она не дублирует Главную.

## Роль Профиля

Профиль будет развиваться отдельно: account, settings, security, privacy, data controls, session/device management после утверждения production auth/backend.

## App-like web behavior

Для текущего web/PWA preview:

- `viewport-fit=cover`;
- standalone manifest;
- Apple mobile web app metadata;
- black-translucent status bar mode;
- app title `ARVELIS AI`;
- safe-area aware layouts.

Это улучшает ощущение приложения при запуске как standalone/PWA, но не выдаётся за native iOS/Android binary.

## Не утверждено

- auth provider;
- email/phone/passwordless strategy;
- Google/Apple/другие IdP;
- production session architecture;
- production user database;
- roles/permissions;
- production privacy/legal documents;
- AI provider/model.
