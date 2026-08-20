# ARVELIS AI — Chat Release Candidate Checklist

Статус: checklist для Draft PR №9 `feat/chat-experience-v1` перед первым runtime-тестом candidate.

Этот документ не утверждает, что PR №9 уже прошёл runtime QA. Он задаёт минимальный критический путь проверки после отдельного разрешённого merge и `Replit → Git → Pull → Run`.

## До merge

Release candidate считается подготовленным к runtime-проверке, если:

- `main` не изменялся в процессе подготовки candidate;
- PR основан на актуальном `main` и не отстаёт от него;
- `.replit`, package runtime и утверждённая геометрия логотипа не изменены;
- AI/backend/auth/secrets не добавлены;
- mock-текст явно остаётся `MOCK` и не выдаётся за ответ модели;
- пользовательский текст не переписывается legacy-нормализацией;
- повреждённые/дублирующиеся localStorage IDs не принимаются как валидный workspace;
- локальные stores имеют лимиты размера и безопасный fallback;
- drafts сохраняются отдельно от workspace и flush выполняется при уходе Safari в background;
- многострочные сообщения сохраняют визуальные переносы строк;
- mobile touch targets, keyboard safe-area и narrow header hardened;
- Search/Rename/Edit не конкурируют с основным composer/mobile navigation;
- Search не вызывает возврат smart-scroll к концу диалога;
- destructive delete использует ConfirmDialog с focus trap;
- hosted CI failure не выдаётся за результат build/typecheck, если job не запустил ни одного шага.

## Первый запуск после merge

1. Replit → Git → `Pull`.
2. Нажать `Run`.
3. Smart Entry должен показать реальный progress по `Интерфейс / Диалог / Данные`.
4. Не должно быть белого экрана, горизонтального overflow или видимого системного scrollbar Smart Entry.
5. После входа должно появиться персональное приветствие сохранённым именем.

## Главная → новый Chat

6. На Главной написать 2–3 строки текста, не отправляя.
7. Перейти в Chat → новый диалог: тот же draft должен восстановиться без мигания текста другого диалога.
8. Вернуться на Главную: draft остаётся тем же.
9. Отправить сообщение. Переносы строк должны сохраниться в bubble.
10. Должен появиться один compact preview notice; реального AI-ответа быть не должно.

## Draft / Safari background

11. В существующем диалоге начать новый draft.
12. Сразу свернуть Safari/Replit preview или переключить приложение.
13. Вернуться/перезагрузить страницу.
14. Последние введённые символы должны восстановиться.

## Message actions

15. `Копировать` user message: success показывается только после реального copy.
16. `Изменить`: сохранить многострочную правку, увидеть `изменено`, затем reload — текст остаётся.
17. MOCK assistant example должен иметь `ARVELIS AI · MOCK` и disclaimer, что это не ответ модели.

## Search / scroll

18. Открыть длинный диалог, прокрутить вверх и убедиться, что появляется `К последнему`.
19. Открыть Search, найти старое сообщение и нажимать `Далее / Назад` — Chat не должен сам возвращаться вниз.
20. Закрыть Search: обычный composer возвращается.

## Rename / delete

21. Переименовать диалог, reload — новое имя сохраняется.
22. Открыть delete → `Отмена`: данные остаются.
23. Повторить delete → подтвердить: thread исчезает, его draft после reload не возвращается.

## iPhone keyboard

24. Открыть основной composer: mobile navigation скрывается, поле не перекрывается клавиатурой.
25. Return на iPhone создаёт новую строку; отправка выполняется кнопкой.
26. Проверить клавиатуру отдельно в Search, Rename и Edit: основной composer/mobile navigation не должны накладываться поверх режима.
27. Закрыть клавиатуру: навигация возвращается корректно.

## Narrow / landscape

28. На ширине около 320–390 px header не должен иметь collision; четыре действия Chat остаются доступны.
29. Длинное название и длинная URL/строка не создают horizontal overflow.
30. Если доступно — повернуть iPhone в landscape и проверить navigation/composer/safe areas.

## Persistence failure / offline

31. При недоступном localStorage интерфейс должен продолжать текущую сессию и показать предупреждение о возможной потере изменений после reload.
32. Offline-state не должен выдавать локальный preview за серверный режим.

## Критерий прохождения первого runtime QA

Candidate проходит первый runtime QA только если:

- нет crash/white screen;
- нет потери обычных drafts/messages при reload;
- нет перекрытия composer клавиатурой;
- нет horizontal overflow;
- create/edit/copy/search/rename/delete работают фактически;
- Smart Entry остаётся правдивой реальной подготовкой;
- PREVIEW/MOCK semantics не вводят пользователя в заблуждение.

Полный расширенный набор проверок остаётся в `docs/12_CHAT_EXPERIENCE_QA.md`.
