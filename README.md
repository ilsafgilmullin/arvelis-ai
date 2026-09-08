# ARVELIS AI

**ARVELIS AI — AI Travel Assistant** для русскоязычных самостоятельных путешественников.

Слоган: `INTELLIGENCE. PRECISION. RESULTS.`

С 2026-09-08 прежнее позиционирование универсального AI-ассистента считается **superseded** решением `Travel Product Pivot`. Бренд, логотип и графитово-золотая визуальная система не изменялись.

## Текущий engineering slice

`Travel Pivot Foundation V1` переводит существующий frontend foundation на Trip-first архитектуру без подключения реального AI или внешних travel API.

Реализуемый пользовательский контур:

- Главная;
- Мои поездки;
- Создать поездку;
- Trip Workspace;
- Профиль.

Основной доменный объект — `Trip`. Пользовательские черновики поездок сохраняются локально и изолируются по account scope. Реальные AI/transport/map/legal/weather/stay/currency providers пока не подключены; интерфейс не генерирует фальшивые рейсы, цены, гостиницы, визовые правила или рекомендации.

## Development

Frontend:

```bash
npm run dev
```

Закрытый Email OTP runtime после настройки protected environment:

```bash
npm run dev:auth
```

Проверки:

```bash
npm run typecheck
npm run test:auth
npm run test:server-auth
npm run test:server-sqlite
npm run test:travel
npm run build:auth-server
npm run build
```

Полный бесплатный локальный check:

```bash
npm run check
```

## Auth foundation

Существующая auth foundation сохранена:

- passwordless Email OTP;
- same-origin Auth API;
- HttpOnly server session;
- SQLite для development/closed test;
- PostgreSQL-compatible persistence;
- protected OTP/session peppers и SMTP credentials;
- `VITE_REAL_AUTH_ENABLED=false` до отдельного rollout решения.

## Truth & security boundary

- Реальный AI provider в этом slice отсутствует.
- Реальные transport/booking/map/legal/weather/stay/currency integrations отсутствуют.
- User-created Trip drafts — реальные пользовательские локальные данные, но не production server persistence.
- Sample/mock content не должен смешиваться с пользовательскими Trip-данными.
- `.env`, SQLite data, SMTP password, OTP/session peppers, API keys и production credentials не коммитятся.
- Merge в `main` и production publish выполняются только после отдельного подтверждения.

См. `docs/00_PROJECT_CONTEXT.md`, `docs/01_PRODUCT.md`, `docs/02_ARCHITECTURE.md`, `docs/06_MVP_GATES.md`, `docs/07_DECISIONS.md` и `docs/42_TRAVEL_PIVOT_FOUNDATION_V1.md`.
