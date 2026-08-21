# ARVELIS AI — App Entry v1 QA

Ветка: `feat/auth-foundation-v1`.
Статус: checklist для frontend preview до merge.

## Entry flow

1. Первый paint — брендовый ARVELIS preboot **ещё до загрузки JavaScript**; пустого чёрного экрана при медленном dev/runtime быть не должно.
2. React Splash бесшовно заменяет static preboot и не показывает fake progress.
3. Splash автоматически переходит к auth foundation.
4. `Вход` и `Регистрация` переключаются без layout jump.
5. Поле имени не вызывает iOS auto-zoom; keyboard не обрезает submit.
6. Preview disclosure остаётся коротким, понятным и не выдаёт локальный flow за production auth.
7. Submit переводит в существующую Smart Entry.
8. Smart Entry показывает реальные stages `Интерфейс / Диалог / Данные`.
9. Boot error по-прежнему имеет Retry.
10. После успешной Smart Entry открывается новый пустой Chat.
11. Старый active thread не должен автоматически открываться после auth.
12. Logout из Профиля возвращает прямо к Auth без повторного Splash и не удаляет локальные диалоги.

## Video QA — 2026-08-21

По реальной iPhone-записи подтверждены и исправлены:

- длительный blank/black first paint до React Splash → static preboot в `index.html`;
- перегруженный auth preview copy → один компактный disclosure;
- Profile выглядел как internal QA page → пользовательские заголовки/copy, QA states отделены как `Диагностика preview`.

## Navigation

1. Mobile bottom navigation содержит `Главная / Чат / История / Профиль`.
2. Главная не содержит второй Chat composer.
3. CTA `Новый чат` на Главной открывает пустой Chat.
4. История открывает выбранный thread в Chat.
5. Профиль и internal states сохраняют существующий flow.
6. При Chat keyboard mobile navigation скрывается по существующему Chat v2 contract.
7. При выходе из Chat document scroll восстанавливается.

## Home

1. Есть блок позиционирования ARVELIS AI.
2. Есть `О проекте`.
3. Есть `Как пользоваться`.
4. Есть privacy/security disclosure.
5. Есть честный PRODUCT PREVIEW status.
6. Недавние диалоги открываются.
7. Нет горизонтального overflow на 320–430 px.

## Profile

1. Заголовки и настройки ориентированы на пользователя, а не на разработчика.
2. Локальный характер профиля обозначен без повторяющегося технического текста.
3. Internal system states явно называются `Диагностика preview`.
4. Reset остаётся destructive action с confirm-dialog.
5. Production account/security не имитируются как работающие до backend.
6. Account Security не показывает fake device/session data.
7. Ошибка session-list API не должна отображаться как «сессий нет».
8. Session-management actions имеют mobile touch target не меньше 44px.

## PWA / iPhone

1. `viewport-fit=cover` сохранён.
2. iPhone safe areas не перекрывают static preboot / Splash / Auth / navigation.
3. Title = `ARVELIS AI`.
4. Apple standalone metadata присутствует.
5. Apple Touch Icon использует утверждённый ARVELIS mark.
6. Add-to-Home-Screen запуск проверяется отдельно; web preview не называется native app.

## Auth architecture

1. `src/auth/contracts.ts` не зависит от конкретного provider SDK.
2. Production auth-state не должен храниться в localStorage.
3. UI обязан иметь session-expired / offline / rate-limit / error states до backend integration.
4. Executable v1 contract поддерживает только `identifier` и `external`; challenge — `code` и `external_redirect`.
5. Passkey/WebAuthn остаётся OPEN-кандидатом и не считается реализованным до отдельного контракта/ceremony implementation.
6. Raw transport payload проходит runtime guard до application state.
7. Session restore не зависит от method catalog.
8. ARVELIS CONTROL не делит user session с ARVELIS AI.

## Protocol negative checks

До real backend integration contract должен отказывать для:

- malformed method/session/challenge/failure payload;
- duplicate ids;
- oversized collection/field payload;
- больше одной `current` session;
- `emailVerified=true` без email;
- `phoneVerified=true` без phone;
- unsafe `external_redirect` (`http`, `javascript:`, `data:`, malformed URL);
- пустого/слишком длинного method/challenge/session id;
- oversized challenge response.

Server-side validation остаётся обязательной даже при frontend guard.

## Known gates

- repository `npm run typecheck` / `npm run build` должны быть выполнены фактически перед merge, если runner доступен;
- текущий GitHub Actions job завершается до первого step и не создаёт step logs — это отдельный infrastructure gate, а не подтверждённая ошибка TypeScript/build;
- dependency lockfile debt из `docs/14_PRE_MERGE_AUDIT.md` остаётся отдельной infrastructure task;
- реальный auth/backend/AI не входит в этот PR.
