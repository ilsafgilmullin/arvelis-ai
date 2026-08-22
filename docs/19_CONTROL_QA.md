# ARVELIS CONTROL — Preview QA

URL preview: `/control/`

## Entry / security disclosure

1. `/control/` открывает отдельную страницу `ARVELIS CONTROL`, а не пользовательский ARVELIS AI.
2. Первый экран явно говорит `INTERNAL FRONTEND PREVIEW`.
3. Первый экран прямо сообщает, что это **не защищённый административный вход**.
4. На preview нет реальных пользователей, писем, production incidents, API keys или secrets.
5. Переход `Открыть локальный прототип` не должен восприниматься как production authentication.

## Replit preview routing

Правильный путь CONTROL находится **до query string**:

`https://<replit-host>/control/?presentationStyle=fullScreen`

Некорректный мобильный ввод вида:

`https://<replit-host>/?presentationStyle=fullScreen/control`

должен автоматически восстановиться в `/control/`, сохранив `presentationStyle=fullScreen`.

## Navigation

Проверить разделы:

- Обзор;
- Поддержка;
- Проблемы;
- Процессы;
- События;
- Настройки.

Desktop: sidebar.
Mobile: compact bottom navigation + mobile topbar.

## Truthfulness

- Auth — `НЕ ПОДКЛЮЧЕНО`.
- AI Gateway — `НЕ ПОДКЛЮЧЕНО`.
- Backend/storage — `НЕ ПОДКЛЮЧЕНО`.
- Support provider — `НЕ ПОДКЛЮЧЕНО`.
- Server audit — `НЕ ПОДКЛЮЧЕНО`.
- Не должно быть fake uptime, fake ticket counts, fake user counts или fake incidents.

## Mobile

Проверить iPhone portrait и landscape:

- нет horizontal overflow;
- safe areas соблюдены;
- bottom nav не перекрывает content;
- все navigation targets остаются usable;
- длинные descriptions переносятся;
- Overview cards не выходят за viewport;
- process/status badges не создают overflow.

## Desktop

- sidebar остаётся sticky;
- основной content не прыгает между разделами;
- summary 4→2 columns на более узких desktop/tablet;
- operational rows не имеют горизонтального overflow.

## Build contract

`vite.config.ts` должен собирать две HTML entry:

- `index.html` — ARVELIS AI;
- `control/index.html` — ARVELIS CONTROL.

Пользовательский `src/App.tsx` не должен импортировать CONTROL.

## Production blockers

CONTROL нельзя подключать к реальным данным до:

- server-side owner/admin auth;
- approved roles/permissions;
- audit log;
- session revoke policy;
- support/infrastructure provider contracts;
- privacy/data-access policy;
- destructive-action confirmation/audit model.
