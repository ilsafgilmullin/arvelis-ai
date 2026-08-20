# ARVELIS AI — Chat Refactor v2 QA

Статус: рабочий candidate. Документ фиксирует проверки только для chat-domain после рефактора `feat/chat-refactor-v2`.

## Цель

Сделать чат и связанную локальную историю самостоятельным профессиональным mobile-first контуром без изменения AI/backend/auth, production data model и утверждённого бренда.

## Проверки iPhone / mobile

1. Открыть существующий диалог с коротким названием.
2. Открыть диалог с длинным названием — header не должен выходить за viewport или сталкиваться с action buttons.
3. Проверить ширину 320–390 px — horizontal overflow отсутствует.
4. Проверить длинное пользовательское сообщение и многострочный текст — bubble не выходит за viewport.
5. Проверить системный preview-status — он отображается компактно и не разрывает поток диалога; повторный disclosure в header не занимает место.
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
16. Под нижней mobile navigation нет второго пустого вертикального резерва/лишнего хвоста прокрутки.
17. Portrait → landscape → portrait не создаёт horizontal overflow и не теряет composer.
18. На touch-устройствах sticky/fixed chat surfaces не требуют нескольких backdrop-blur слоёв; scrolling и ввод остаются плавными.

## Search внутри диалога

1. Открыть search из header.
2. Search input не сталкивается с header и не выходит за viewport.
3. При фокусе search клавиатура не конфликтует с composer/mobile navigation.
4. Пока search-mode открыт на mobile, основной composer скрыт даже после ручного закрытия клавиатуры.
5. `↑ / ↓` циклически переходят между найденными сообщениями.
6. Активное совпадение заметно, но не меняет содержимое сообщения.
7. Закрытие search возвращает обычный chat layout.
8. Поиск не изменяет сохранённые сообщения.
9. Технический system preview-status не участвует в поиске и не создаёт ложные совпадения по словам вроде `AI`, `локально`, `сохранено`.

## Message actions

1. Copy user message.
2. Copy assistant/mock message.
3. Успешный copy даёт краткий доступный feedback.
4. Edit доступен только пользовательскому сообщению.
5. Edit открывается отдельным sheet, а не раздвигает message stream.
6. Keyboard при edit не перекрывает input/actions.
7. При первом открытии edit caret ставится в конец существующего текста ровно один раз.
8. Во время дальнейшего редактирования caret не должен принудительно прыгать в конец.
9. Cancel не изменяет сообщение.
10. Save обновляет сообщение и помечает его как `изменено`.
11. Пустое сообщение сохранить нельзя.
12. Максимальная длина сообщения соблюдается.

## Thread actions

1. Overflow menu открывается отдельным action sheet.
2. Новый диалог работает и закрывает sheet.
3. При достигнутом thread limit действие нового диалога недоступно.
4. Если первый action disabled, начальный focus переходит на следующий доступный control, а не остаётся за sheet.
5. Rename открывается отдельным sheet.
6. Rename input не выходит за реальный `visualViewport` при открытой iPhone keyboard.
7. Edit/action sheets также пересчитывают геометрию при `visualViewport.resize/scroll`.
8. При открытии rename текущее название выделяется целиком.
9. Enter в rename сохраняет непустое название.
10. Save переименовывает только текущий thread.
11. Rename не меняет `updatedAt`, не поднимает старый thread наверх и не меняет отображаемое время последней активности.
12. Cancel сохраняет исходное название.
13. Delete использует confirm-dialog и не выполняется без подтверждения.
14. После delete удалённый draft не восстанавливается.
15. Тап по backdrop закрывает sheet только после завершения жеста и не активирует элемент под overlay.

## История и metadata диалогов

1. History показывает локальные threads без изменения порядка данных.
2. В каждой строке видны title, краткий preview последнего не-system сообщения, реальное количество пользовательских/assistant сообщений и относительное время.
3. System preview-status не увеличивает счётчик сообщений.
4. System preview-status не участвует в поиске History.
5. Русская форма счётчика корректна: `1 сообщение`, `2 сообщения`, `5 сообщений`.
6. Только что созданный/изменённый контент показывает `только что`, без искусственного `1 мин назад`.
7. Те же message-count/time правила используются в Home → `Недавние диалоги`; Home и History не расходятся.
8. Длинный title и preview обрезаются без horizontal overflow.
9. Поиск ищет и по title, и по реальному содержимому сообщений.
10. Clear-кнопка полностью очищает search и восстанавливает список; search-wrapper не содержит вложенных конфликтующих label/button semantics.
11. Пустой результат показывает понятный empty state.
12. Открытие строки переводит именно в выбранный thread.
13. Delete требует confirm-dialog и удаляет только выбранный локальный thread.
14. На ширинах 320–390 px search/list/delete controls не сталкиваются друг с другом; основные touch-targets остаются около 44 px.

## Desktop

1. Header, message stream и composer ограничены единым content width.
2. Enter отправляет сообщение.
3. Shift+Enter создаёт новую строку.
4. Hover/focus actions доступны и не вызывают layout shift.
5. History остаётся читаемой на широком экране и не растягивает строки на всю ширину без ограничения.
6. Sidebar и остальные экраны не меняют поведение из-за chat-only CSS.

## Accessibility

1. Header/search/composer/action-sheet controls имеют видимый focus state.
2. Touch-target основных действий не меньше примерно 40–44 px на mobile; ключевые header/search/history actions сохраняют 44 px и на 320–370 px.
3. Chat sheets имеют `role=dialog` и `aria-modal=true`.
4. При открытии chat sheet фокус переводится внутрь; Tab/Shift+Tab не уходят за пределы sheet.
5. Disabled control не может стать autofocus target.
6. Escape закрывает chat sheet, после закрытия фокус возвращается к предыдущему элементу, если он ещё существует.
7. Пока chat sheet открыт, background body scroll блокируется.
8. ConfirmDialog сохраняет собственный focus trap и destructive confirmation.
9. Copy feedback доступен через `aria-live`.
10. Search result count доступен через `aria-live`.
11. Reduced motion не требует анимаций для понимания состояния.

## Regression guard

Не должны измениться:

- бренд и геометрия логотипа;
- Smart Entry;
- Home business logic (кроме согласованного отображения chat metadata в блоке недавних диалогов);
- History/localStorage data model;
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
- затем фактический ручной `Pull → Run` в Replit и iPhone smoke-test по ключевым пунктам выше;
- Replit Agent для этого gate не требуется и не должен использоваться без отдельного запроса пользователя.
