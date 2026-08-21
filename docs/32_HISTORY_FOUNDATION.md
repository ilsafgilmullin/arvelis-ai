# ARVELIS AI — History Foundation v1

## Статус

History Foundation собран как отдельный stacked-слой поверх `feat/profile-foundation-v1`.

Экран работает только с текущей локальной preview-историей. Server history, cloud sync, multi-device history и AI-generated summaries пока не подключены.

## Цель

История должна быть быстрым рабочим списком диалогов, а не декоративным архивом.

Основной контракт:

1. найти нужный разговор;
2. увидеть краткий безопасный preview;
3. открыть разговор;
4. удалить отдельный локальный диалог с подтверждением;
5. ясно различать пустую историю и пустой результат поиска.

## Что изменено

### Сортировка

Presentation больше не зависит от физического порядка массива `threads`.

Перед показом создаётся копия и сортируется по `updatedAt` по убыванию.

Это важно, потому что rename/delete/storage migrations не должны случайно менять смысл «последние диалоги».

Исходный массив не мутируется.

### Поиск

Поиск остаётся локальным и ограничен существующим `CHAT_SEARCH_MAX_CHARS`.

Индекс включает:

- title;
- user messages;
- assistant/mock messages;

System preview/status messages намеренно исключены.

Поиск case-insensitive через `toLocaleLowerCase('ru-RU')`.

### Summary

Без query показывается корректная русская форма:

- `1 диалог`;
- `2 диалога`;
- `5 диалогов`.

При поиске показывается `Найдено X из Y`.

Рядом явно указано, что это данные текущего устройства.

### Rows

Каждая строка показывает:

- title;
- preview последнего non-system сообщения;
- count non-system messages;
- relative updated time;
- open action;
- отдельный delete action.

Используются общие `chatPresentation` helpers, поэтому Home и History не расходятся по count/time/preview semantics.

### Delete

Удаление остаётся только индивидуальным.

Bulk clear history намеренно не добавлен: это отдельное destructive product decision и не требуется для текущего этапа.

Перед удалением используется `ConfirmDialog`.

App-level `onDelete` по-прежнему удаляет соответствующий chat draft и thread из workspace.

### Empty states

Разделены два состояния:

- история действительно пуста;
- query не дал результатов.

Для пустой истории UI направляет пользователя во вкладку `Чат`.

Для search-empty есть явная кнопка `Очистить поиск`.

## Mobile-first contract

- search input = 16px на mobile, без Safari auto-zoom;
- clear/delete touch target = 44px;
- row использует `minmax(0, 1fr)`, поэтому длинный title/preview не раздвигает layout;
- preview не зависит от `vw`, а ограничивается фактическим grid-контейнером;
- title/preview/meta используют ellipsis;
- <=380px summary может переходить в две строки;
- safe-area left/right сохраняются;
- coarse-touch hover-state сбрасывается без изменения нормального цвета delete/clear controls;
- существующая bottom navigation и iPhone landscape contract не меняются.

## Accessibility

- section связан через `aria-labelledby`;
- search region имеет `role="search"` и label;
- input имеет accessible label;
- clear search имеет отдельный `aria-label`;
- delete action включает title диалога в accessible name;
- result count обновляется через `aria-live="polite"`;
- destructive delete проходит через доступный ConfirmDialog.

## Truthfulness / data scope

История не показывает fake server/cloud status.

`PREVIEW` и `Данные этого устройства` отражают фактический текущий режим.

System preview messages не считаются пользовательским содержимым диалога.

## Изменённые файлы

Относительно `feat/profile-foundation-v1` History Foundation должен содержать только:

- `src/screens/HistoryScreen.tsx`;
- `src/history-foundation-v1.css`;
- `src/main.tsx` — один CSS import;
- `docs/32_HISTORY_FOUNDATION.md`.

Не меняются:

- App routing contract;
- Auth Core;
- Home;
- Profile;
- Chat geometry/runtime;
- ARVELIS CONTROL;
- backend/AI integrations.

## Verification gate

Перед stacked PR:

- diff isolation = History scope only;
- `behind_by=0` относительно Profile base;
- PR mergeable;
- sorting не мутирует input threads;
- search excludes system messages;
- delete остаётся confirm-first;
- no-result и empty-history тексты различаются;
- mobile row не использует viewport-width как внутренний content limit.

Repository-level gates остаются в issue #13:

- TypeScript 6.0.3 `npm run typecheck`;
- dependency-environment `npm run test:auth`;
- `npm run build`;
- настоящий `package-lock.json`.

## Merge policy

Стек:

`PR #11 Auth → PR #14 Home → PR #15 Profile → History PR`.

History PR остаётся Draft до проверки нижележащих PR и отдельного подтверждения пользователя.