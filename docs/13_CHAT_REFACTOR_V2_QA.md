# ARVELIS AI — Chat Refactor v2 QA

Статус: рабочий candidate. Документ фиксирует проверки только для chat-domain после рефактора `feat/chat-refactor-v2`.

## Цель

Сделать чат и связанную локальную историю самостоятельным профессиональным mobile-first контуром без изменения AI/backend/auth, production data model и утверждённого бренда.

## Проверки iPhone / mobile

1. Открыть существующий диалог с коротким названием.
2. Открыть диалог с длинным названием — header не должен выходить за viewport или сталкиваться с action buttons.
3. Проверить ширину 320–390 px — horizontal overflow отсутствует.
4. Проверить длинное пользовательское сообщение и многострочный текст — bubble не выходит за viewport.
5. Проверить системный preview-status — он отображается компактно и не разрывает поток диалога.
6. Проверить несколько сообщений подряд — между сообщениями нет избыточных вертикальных провалов.
7. Открыть composer — клавиатура не перекрывает поле и кнопку отправки.
8. При открытой клавиатуре mobile navigation скрывается, после закрытия восстанавливается.
9. Return на touch-устройстве создаёт новую строку; отправка выполняется кнопкой.
10. Composer растёт по высоте до ограниченного максимума и затем скроллится внутри.
11. Черновик сохраняется после перехода назад/в History и после возврата восстанавливается.
12. Отправка сообщения очищает только черновик текущего thread.
13. Новый диалог показывает компактный empty state и быстрые заготовки без большого hero-экрана.
14. Quick-start только заполняет composer и не отправляет текст автоматически.
15. Кнопка `К последнему` появляется при уходе вверх по длинной переписке и возвращает к последнему сообщению.

## Search внутри диалога

1. Открыть search из header.
2. Search input не сталкивается с header и не выходит за viewport.
3. При фокусе search клавиатура не конфликтует с composer/mobile navigation.
4. `↑ / ↓` циклически переходят между найденными сообщениями.
5. Активное совпадение заметно, но не меняет содержимое сообщения.
6. Закрытие search возвращает обычный chat layout.
7. Поиск не изменяет сохранённые сообщения.

## Message actions

1. Copy user message.
2. Copy assistant/mock message.
3. Успешный copy даёт краткий доступный feedback.
4. Edit доступен только пользовательскому сообщению.
5. Edit открывается отдельным sheet, а не раздвигает message stream.
6. Keyboard при edit не перекрывает input/actions.
7. При вводе в edit caret не должен принудительно прыгать в конец текста.
8. Cancel не изменяет сообщение.
9. Save обновляет сообщение и помечает его как `изменено`.
10. Пустое сообщение сохранить нельзя.
11. Максимальная длина сообщения соблюдается.

## Thread actions

1. Overflow menu открывается отдельным action sheet.
2. Новый диалог работает и закрывает sheet.
3. При достигнутом thread limit действие нового диалога недоступно.
4. Rename открывается отдельным sheet.
5. Rename input не выходит за viewport при keyboard.
6. Enter в rename сохраняет непустое название.
7. Save переименовывает только текущий thread.
8. Cancel сохраняет исходное название.
9. Delete использует confirm-dialog и не выполняется без подтверждения.
10. После delete удалённый draft не восстанавливается.

## История диалогов

1. History показывает локальные threads без изменения порядка данных.
2. В каждой строке видны title, краткий preview последнего не-system сообщения, количество сообщений и относительное время.
3. Длинный title и preview обрезаются без horizontal overflow.
4. Поиск ищет и по title, и по содержимому сообщений.
5. Clear-кнопка полностью очищает search и восстанавливает список.
6. Пустой результат показывает понятный empty state.
7. Открытие строки переводит именно в выбранный thread.
8. Delete требует confirm-dialog и удаляет только выбранный локальный thread.
9. На ширинах 320–390 px search/list/delete controls не сталкиваются друг с другом.

## Desktop

1. Header, message stream и composer ограничены единым content width.
2. Enter отправляет сообщение.
3. Shift+Enter создаёт новую строку.
4. Hover/focus actions доступны и не вызывают layout shift.
5. History остаётся читаемой на широком экране и не растягивает строки на всю ширину без ограничения.
6. Sidebar и остальные экраны не меняют поведение из-за chat-only CSS.

## Accessibility

1. Header/search/composer/action-sheet controls имеют видимый focus state.
2. Touch-target основных действий не меньше примерно 40–44 px на mobile.
3. Chat sheets имеют `role=dialog` и `aria-modal=true`.
4. При открытии chat sheet фокус переводится внутрь; Tab/Shift+Tab не уходят за пределы sheet.
5. Escape закрывает chat sheet, после закрытия фокус возвращается к предыдущему элементу, если он ещё существует.
6. Пока chat sheet открыт, background body scroll блокируется.
7. ConfirmDialog сохраняет собственный focus trap и destructive confirmation.
8. Copy feedback доступен через `aria-live`.
9. Search result count доступен через `aria-live`.
10. Reduced motion не требует анимаций для понимания состояния.

## Regression guard

Не должны измениться:

- бренд и геометрия логотипа;
- Smart Entry;
- Home business logic;
- History data model;
- Profile;
- localStorage schema;
- AI/backend/auth;
- production secrets;
- package/runtime versions;
- `.replit`.

## Gate перед merge

Минимум:

- `npm run typecheck` успешно;
- `npm run build` успешно;
- branch не отстаёт от `main`;
- PR mergeable;
- затем фактический Replit `Pull → Run` и iPhone smoke-test по ключевым пунктам выше.
