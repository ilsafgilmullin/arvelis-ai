# ARVELIS AI — Profile Foundation v1

## Статус

Profile Foundation собран как отдельный stacked-слой поверх `feat/home-foundation-v1`.

Текущий экран всё ещё работает в честном `LOCAL PREVIEW`: настоящая серверная учётная запись, identity provider, production database, межустройственная синхронизация, экспорт данных и удаление production-аккаунта пока не подключены.

## Цель

Профиль должен выглядеть как будущий account center ARVELIS AI, но не изображать ещё несуществующие account/backend-функции.

Информационная иерархия:

1. Профиль пользователя.
2. Личные данные.
3. Аккаунт и безопасность.
4. Данные и конфиденциальность.
5. Управление preview-профилем.

## Что реализовано

### Identity

- фактическое локальное имя пользователя;
- avatar-initial из текущего имени;
- компактный статус `LOCAL PREVIEW`;
- явное пояснение, что server account будет отдельным этапом.

Не добавляются выдуманные email, телефон, тариф, роль или дата регистрации.

### Отображаемое имя

Используется общая policy `src/auth/previewProfile.ts`.

Инварианты:

- один источник лимита длины;
- validation выполняется до сохранения;
- normalizable whitespace сохраняется в canonical форме;
- Unicode control/format characters блокируются общей auth policy;
- Enter работает как submit;
- input имеет `font-size: 16px` для защиты от нежелательного Safari auto-zoom;
- пароль/секреты не запрашиваются.

### Аккаунт и безопасность

Существующий `AccountSecurityPanel` сохранён как provider-independent foundation.

В текущем runtime он получает `connected={false}`, поэтому UI прямо показывает отсутствие server session/device backend. Fake devices или fake active sessions на пользовательском Profile не выводятся.

Реальные session states остаются только на internal QA-экране.

### Данные и конфиденциальность

Profile получает фактический `persistenceAvailable` из `App` — тот же state, который используется глобальным storage-banner.

Показываются только проверяемые состояния:

- `ДОСТУПНО`: текущий workspace удалось сохранить в browser storage;
- `НЕДОСТУПНО`: browser storage не подтвердил сохранение;
- server storage: `НЕ ПОДКЛЮЧЕНО`;
- export/account deletion lifecycle: `ПОСЛЕ BACKEND`.

Этот блок не обещает cloud sync или production data controls до их реализации.

## Управление

Три действия разделены семантически:

### Выйти из preview-профиля

Возвращает на Auth. Локальная история и имя остаются на устройстве.

### Диагностика preview

Internal QA entry. Не находится в основной навигации и визуально помечен как preview/internal action.

### Сбросить локальные данные

Destructive action требует ConfirmDialog.

После подтверждения:

- очищаются chat drafts;
- удаляется локальный workspace;
- создаётся clean reset-state;
- имя возвращается к system default;
- приложение возвращается на регистрацию.

Пользователь не остаётся внутри app после удаления единственного локального preview-профиля.

## Mobile-first contract

- 16px input на мобильном;
- form controls не меньше 50px;
- primary data/action rows безопасно переходят в одну колонку;
- status labels не вызывают horizontal overflow;
- long copy использует safe wrapping;
- <=420px identity также становится одной колонкой;
- touch devices не сохраняют ложный desktop hover-state;
- существующие AppLayout safe areas и bottom navigation не меняются;
- iPhone landscape contract остаётся в `layout-hardening.css`.

## Accessibility

- section headings связаны через `aria-labelledby`;
- input имеет явный label;
- hint/error связаны через `aria-describedby`;
- validation error использует `role="alert"`;
- destructive reset подтверждается доступным ConfirmDialog;
- статус local persistence выражен текстом, а не только цветом.

## Truthfulness / product boundaries

В Profile намеренно отсутствуют:

- fake email/phone;
- fake subscription/tariff;
- fake cloud sync;
- fake server devices;
- fake server account identifier;
- fake export/download;
- fake production account deletion;
- реальные auth-provider кнопки.

Эти функции должны появляться только после отдельного утверждения identity/data/access model и реального backend.

## Изменённые файлы

Относительно `feat/home-foundation-v1` Profile Foundation должен содержать только:

- `src/App.tsx` — передача уже существующего `persistenceAvailable`;
- `src/main.tsx` — подключение отдельного Profile CSS layer;
- `src/profile-foundation-v1.css`;
- `src/screens/ProfileScreen.tsx`;
- `docs/31_PROFILE_FOUNDATION.md`.

## Verification gate

Source-level перед PR:

- diff isolation = только Profile scope;
- `behind_by=0` относительно Home base;
- stacked PR mergeable;
- ProfileScreen/App prop contract согласован;
- reset lifecycle не регрессировал;
- `AccountSecurityPanel` остаётся `connected=false` в пользовательском preview;
- storage status использует фактический `persistenceAvailable`.

Repository-level gates остаются в infrastructure issue #13:

- настоящий `npm run typecheck` на TypeScript 6.0.3;
- `npm run test:auth` в project dependency environment;
- `npm run build`;
- настоящий `package-lock.json`.

Не считать isolated/source smoke заменой этих проверок.

## Merge policy

Profile Foundation является stacked Draft поверх Home Foundation.

Порядок:

`PR #11 Auth → PR #14 Home → Profile PR`.

Не merge в `main` и не ретаргетировать стек без отдельной проверки и подтверждения.