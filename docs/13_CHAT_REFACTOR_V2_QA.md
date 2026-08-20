# ARVELIS AI — Chat Refactor v2 QA

Статус: рабочий candidate. Документ фиксирует проверки только для chat-domain после рефакторинга `feat/chat-refactor-v2`.

## Цель

Сделать чат и связанную локальную историю самостоятельным профессиональным mobile-first контуром без изменения AI/backend/auth, production data model и утверждённого бренда.

## Реальные iPhone smoke-проходы

Проведено четыре видео-прохода на iPhone через Replit preview без Replit Agent.

Подтверждено фактически:

- существующие threads открываются;
- отправка сообщений и локальное сохранение работают;
- несколько сообщений подряд остаются доступными над composer;
- черновик переживает rotation;
- `•••` action sheet открывается и закрывается корректно;
- rename sheet работает с software keyboard и сохраняет title;
- History открывается, локальные metadata отображаются, переход в другой thread работает;
- portrait message stream после viewport-shell перехода больше не прокручивается вместе с document;
- message stream в portrait не проходит под composer/mobile navigation;
- compact PREVIEW/MOCK disclosure остаётся честным;
- Replit Agent не использовался.

Четвёртый видео-проход выявил два блокирующих Safari edge-case:

1. при software keyboard Safari менял не только `visualViewport.height`, но и `offsetTop`; shell учитывал только высоту, поэтому header уходил под status bar;
2. iPhone landscape имеет CSS-width около 844 px, поэтому старый `max-width: 780px` выключал mobile viewport-shell и document-scroll lock именно в landscape. Это возвращало старую layout-модель и могло уводить composer из видимой области при keyboard.

Исправление candidate после четвёртого прохода:

- AppLayout публикует полный visual viewport rectangle: `top / left / width / height`;
- mobile Chat shell фиксируется внутри этого rectangle;
- mobile contract применяется не только при `max-width: 780px`, но и для touch-landscape с малой высотой независимо от ширины;
- тот же media contract используется для body/root scroll lock;
- landscape navigation становится compact/icon-only, сохраняя >=44 px touch targets;
- при landscape keyboard header временно скрывается, чтобы composer гарантированно помещался в реально доступный viewport;
- background message stream остаётся единственной scrollable областью;
- `К последнему` сокращён до 44px icon-only control, чтобы не перекрывать широкую часть нижнего сообщения.

Важно: перечисленные выше последние visualViewport/breakpoint fixes внесены после четвёртого видео и сами ещё не считаются real-device подтверждёнными до следующего Pull → Run.

## Фактические статические проверки последнего head

- `AppLayout.tsx` прогнан через изолированный strict TypeScript smoke с `strict=true`, `noUncheckedIndexedAccess=true`, DOM lib и JSX; ошибок не получено.
- Локальная среда smoke использовала TypeScript 5.8.3, поэтому это parser/local-type guard, а не замена project TypeScript 6.0.3 `npm run typecheck`.
- GitHub Actions по-прежнему не запускает ни одного workflow step (`steps=null`), поэтому repository typecheck/build остаются незакрытым gate.

## Проверки iPhone / mobile

1. Открыть существующий диалог с коротким названием.
2. Открыть диалог с длинным названием — header не должен выходить за viewport или сталкиваться с action buttons.
3. Проверить ширину 320–390 px — horizontal overflow отсутствует.
4. Проверить длинное пользовательское сообщение и многострочный текст — bubble не выходит за viewport.
5. Проверить системный preview-status — он отображается компактно и не разрывает поток диалога; повторный disclosure в header не занимает место.
6. Открыть legacy/demo thread только с user-message и без system notice — компактный header disclosure остаётся видимым, чтобы отсутствие AI-ответа не маскировалось.
7. Thread с `MOCK` или system preview-status не получает второй дублирующий disclosure в header.
8. Проверить несколько сообщений подряд — между сообщениями нет избыточных вертикальных провалов.
9. Открыть composer — клавиатура не перекрывает поле и кнопку отправки.
10. При открытой клавиатуре mobile navigation скрывается, после закрытия восстанавливается.
11. При открытой portrait keyboard header остаётся полностью ниже iOS status bar и не уходит под него.
12. Return на touch-устройстве создаёт новую строку; отправка выполняется кнопкой.
13. Desktop-only подсказка `Enter — отправить` не показывается на touch-устройстве и не противоречит фактической Return-логике.
14. Composer растёт по высоте до ограниченного максимума и затем скроллится внутри.
15. Черновик сохраняется после перехода назад/в History и после возврата восстанавливается.
16. Отправка сообщения очищает только черновик текущего thread.
17. Новый диалог показывает компактный empty state и быстрые заготовки без большого hero-экрана.
18. Quick-start только заполняет composer и не отправляет текст автоматически.
19. Компактная icon-only кнопка перехода к последнему сообщению появляется при уходе вверх, остаётся >=44 px и не перекрывает широкую часть нижнего bubble.
20. Под нижней mobile navigation нет второго пустого вертикального резерва/лишнего хвоста прокрутки.
21. Portrait → landscape → portrait не создаёт horizontal overflow и не теряет composer.
22. В landscape Chat остаётся внутри mobile viewport-shell даже при CSS-width >780 px.
23. В landscape без keyboard message stream, composer и compact navigation не пересекаются.
24. В landscape с keyboard header может скрываться, но composer и кнопка отправки обязаны оставаться видимыми.
25. На touch-устройствах sticky/fixed chat surfaces не требуют нескольких backdrop-blur слоёв; scrolling и ввод остаются плавными.
26. Header/search/message action touch-targets имеют не менее 44 px, включая ширины 320–370 px и landscape compact navigation.
27. Перевести устройство offline — runtime banner не перекрывает chat header.
28. Одновременно показать offline + storage banner — header и search остаются ниже фактической суммарной высоты banners.
29. Изменить ориентацию при активном runtime banner — offset пересчитывается без ручной перезагрузки.

## Mobile viewport-shell contract

1. Пока открыт Chat на mobile/touch-landscape, document/root scroll заблокирован.
2. Прокручивается только `.chat-v2-thread`.
3. `app-shell--chat` совпадает с текущим `visualViewport` по top/left/width/height.
4. Safari browser chrome или keyboard resize не должен сдвигать header под status bar.
5. Composer не использует цепочку sticky/fixed keyboard offsets — он является нижним flex child chat-page.
6. Mobile navigation находится внутри bounded shell и не должна показывать message content под собой.
7. При переходе Chat → History/Home/Profile обычный document scroll полностью восстанавливается.
8. При возврате History → Chat старый document scroll не влияет на позицию thread.

## Search внутри диалога

1. Открыть search из header.
2. Search input не сталкивается с header и не выходит за viewport.
3. При наличии runtime banner search располагается ниже banner/header, а не под ними.
4. При фокусе search клавиатура не конфликтует с composer/mobile navigation.
5. Пока search-mode открыт на mobile, основной composer скрыт даже после ручного закрытия клавиатуры.
6. `↑ / ↓` циклически переходят между найденными сообщениями.
7. Активное совпадение заметно, но не меняет содержимое сообщения.
8. Закрытие search возвращает обычный chat layout.
9. Поиск не изменяет сохранённые сообщения.
10. Технический system preview-status не участвует в поиске и не создаёт ложные совпадения по словам вроде `AI`, `локально`, `сохранено`.

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
8. Высота sheet ограничена уже синхронизированным visible viewport: высокая клавиатура не оставляет верх/действия за экраном.
9. При открытии rename текущее название выделяется целиком.
10. Enter в rename сохраняет непустое название.
11. Save переименовывает только текущий thread.
12. Rename не меняет `updatedAt`, не поднимает старый thread наверх и не меняет отображаемое время последней активности.
13. Cancel сохраняет исходное название.
14. Delete использует confirm-dialog и не выполняется без подтверждения.
15. После delete удалённый draft не восстанавливается.
16. Тап по backdrop ChatSheet закрывает его только после завершения жеста и не активирует элемент под overlay.
17. Тап по backdrop ConfirmDialog также не создаёт click-through в underlying chat UI.

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

1. Chat shell занимает минимум реальную высоту viewport (`100dvh`), чтобы короткий thread/empty state не схлопывал рабочую композицию вверх.
2. Header, message stream и composer ограничены единым content width.
3. Enter отправляет сообщение.
4. Shift+Enter создаёт новую строку.
5. Hover/focus actions доступны и не вызывают layout shift.
6. History остаётся читаемой на широком экране и не растягивает строки на всю ширину без ограничения.
7. Sidebar и остальные экраны не меняют поведение из-за chat-only CSS.
8. Offline/storage banner также не перекрывает sticky chat header/search на desktop.

## Accessibility

1. Header/search/composer/action-sheet controls имеют видимый focus state.
2. Ключевые mobile chat action touch-targets — минимум 44 px: header, search navigation, message actions, send, history controls, jump-to-latest.
3. Chat sheets имеют `role=dialog` и `aria-modal=true`.
4. При открытии chat sheet фокус переводится внутрь; Tab/Shift+Tab не уходят за пределы sheet.
5. Disabled control не может стать autofocus target.
6. Escape закрывает chat sheet, после закрытия фокус возвращается к предыдущему элементу, если он ещё существует.
7. Пока chat sheet открыт, background body scroll блокируется.
8. ConfirmDialog сохраняет собственный focus trap и destructive confirmation.
9. Copy feedback доступен через `aria-live`.
10. Search result count доступен через `aria-live`.
11. Reduced motion не требует анимаций для понимания состояния.
12. Runtime banners остаются в `aria-live=polite`, а их layout-offset не меняет содержание/семантику объявления.

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
- повторный `Pull → Run` последних viewport/breakpoint commits;
- portrait keyboard: header ниже status bar, composer видим;
- landscape keyboard: mobile shell остаётся активным, composer видим, header при необходимости скрыт;
- History → Chat не создаёт document-scroll jump;
- New Chat/empty state не пересекается с composer/nav;
- Replit Agent для этого gate не требуется и не должен использоваться без отдельного запроса пользователя.
