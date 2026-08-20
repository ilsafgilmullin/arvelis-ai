# ARVELIS AI — iPhone Video QA

Дата: 2026-08-21.
Источник: реальная запись Replit preview на iPhone, ~42.6 сек.
Ветка на момент записи: `feat/auth-foundation-v1` до последующих исправлений.

## Фактически пройденные сценарии

В записи видны:

- auth foundation;
- refresh/reload;
- branded Splash;
- переход обратно к auth;
- Smart Entry;
- новый Chat;
- Главная;
- возврат в Chat;
- История;
- Профиль.

Критического React crash/white screen в пользовательском flow не зафиксировано.

## Найдено и исправлено

### P1 — blank first paint после reload

При refresh примерно на участке 3.5–5.5 сек виден полностью пустой чёрный экран до появления React Splash.

Причина: branded Splash существует только после загрузки JS/React bundle.

Исправление:

- добавлен минимальный static branded preboot прямо в `index.html`;
- preboot появляется до JS;
- `src/main.tsx` удаляет его только после двух `requestAnimationFrame`, когда React уже получил возможность отрисовать Splash.

Это особенно важно для Replit/dev/slow network и будущего PWA first paint.

### P2 — auth screen перегружен preview-copy

На реальном iPhone одновременно видны несколько формулировок о локальном profile/auth/backend, что делает экран техническим и визуально тяжёлым.

Исправление:

- signup title сокращён до `Создать профиль`;
- основной текст сокращён;
- primary CTA унифицирован как `Продолжить`;
- security disclosure объединён в один компактный блок;
- legal preview-copy сокращён;
- mode switch исправлен с некорректного tablist на `aria-pressed` segmented control.

### P2 — Profile выглядит как internal QA

В видео видны `frontend preview`, `LOCAL PREVIEW PROFILE`, `Состояния интерфейса`, `SECURITY STATUS` как обычные пользовательские заголовки.

Исправление:

- `Профиль и настройки` → `Профиль`;
- subtitle и profile status переведены в пользовательскую формулировку;
- internal states явно названы `Диагностика preview`;
- security card названа `Аккаунт и безопасность`;
- destructive reset copy сокращён.

## Подтверждено как рабочее по записи

- Splash композиционно сохраняет ARVELIS brand;
- Auth → Smart Entry переход работает;
- Smart Entry показывает stage/progress UI;
- после входа открывается новый Chat;
- bottom navigation `Главная / Чат / История / Профиль` доступна;
- Главная больше не дублирует composer;
- History открывается;
- Profile открывается;
- основные экраны не имеют явного horizontal overflow в записанном portrait viewport.

## Требует повторного runtime подтверждения после исправлений

- static preboot действительно убрал blank first paint;
- auth copy не создаёт overflow на 320–430 px;
- iPhone keyboard не перекрывает auth CTA после обновлённого текста;
- Profile остаётся корректным после обновлённой copy;
- PWA/Add-to-Home-Screen icon/splash behavior.

## Не проверено этим видео

- Android;
- desktop;
- offline auth-entry;
- reduced motion;
- actual PWA standalone launch;
- production auth/backend;
- ARVELIS CONTROL `/control/`.
