# ARVELIS AI — Chat Refactor v2 QA

Статус: рабочий candidate. Документ фиксирует проверки только для chat-scope после рефактора `feat/chat-refactor-v2`.

## Цель

Сделать чат самостоятельным профессиональным mobile-first интерфейсом без изменения AI/backend/auth, production data model и утверждённого бренда.

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

## Search

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
7. Cancel не изменяет сообщение.
8. Save обновляет сообщение и помечает его как `изменено`.
9. Пустое сообщение сохранить нельзя.
10. Максимальная длина сообщения соблюдается.

## Thread actions

1. Overflow menu открывается отдельным action sheet.
2. Новый диалог работает и закрывает sheet.
3. При достигнутом thread limit действие нового диалога недоступно.
4. Rename открывается отдельным sheet.
5. Rename input не выходит за viewport при keyboard.
6. Save переименовывает только текущий thread.
7. Cancel сохраняет исходное название.
8. Delete использует confirm-dialog и не выполняется без подтверждения.
9. После delete удалённый draft не восстанавливается.

## Desktop

1. Header, message stream и composer ограничены единым content width.
2. Enter отправляет сообщение.
3. Shift+Enter создаёт новую строку.
4. Hover/focus actions доступны и не вызывают layout shift.
5. Sidebar и остальные экраны не меняют поведение из-за chat-only CSS.

## Accessibility

1. Header/search/composer/action-sheet controls имеют видимый focus state.
2. Touch-target основных действий не меньше примерно 40–44 px на mobile.
3. Dialog/sheet имеют `role=dialog` и `aria-modal=true`.
4. Copy feedback доступен через `aria-live`.
5. Search result count доступен через `aria-live`.
6. Reduced motion не требует анимаций для понимания состояния.

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
