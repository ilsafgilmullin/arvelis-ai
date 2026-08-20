# ARVELIS AI — App Entry v1 QA

Ветка: `feat/auth-foundation-v1`.
Статус: checklist для frontend preview до merge.

## Entry flow

1. Первый paint — только брендовый Splash ARVELIS AI.
2. Splash не показывает fake progress и автоматически переходит к auth foundation.
3. `Вход` и `Регистрация` переключаются без layout jump.
4. Поле имени не вызывает iOS auto-zoom; keyboard не обрезает submit.
5. Preview disclosure остаётся видимым и не выдаёт локальный flow за production auth.
6. Submit переводит в существующую Smart Entry.
7. Smart Entry показывает реальные stages `Интерфейс / Диалог / Данные`.
8. Boot error по-прежнему имеет Retry.
9. После успешной Smart Entry открывается новый пустой Chat.
10. Старый active thread не должен автоматически открываться после auth.

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

## PWA / iPhone

1. `viewport-fit=cover` сохранён.
2. iPhone safe areas не перекрывают Splash/Auth/navigation.
3. Title = `ARVELIS AI`.
4. Apple standalone metadata присутствует.
5. Add-to-Home-Screen запуск проверяется отдельно; web preview не называется native app.

## Known gates

- repository `npm run typecheck` / `npm run build` должны быть выполнены фактически перед merge, если runner доступен;
- dependency lockfile debt из `docs/14_PRE_MERGE_AUDIT.md` остаётся отдельной infrastructure task;
- реальный auth/backend/AI не входит в этот PR.
