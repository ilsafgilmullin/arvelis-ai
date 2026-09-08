# ARVELIS AI

**ARVELIS AI — AI-first Travel Assistant** для русскоязычных самостоятельных путешественников.

Слоган: `INTELLIGENCE. PRECISION. RESULTS.`

С 2026-09-08 продуктовая вертикаль зафиксирована как Travel Assistant. В `Travel UI Redesign V2` прежний dark/gold пользовательский Travel UI superseded новым light AI-first направлением: светлый фон, teal/blue/green palette, side drawer и Trip Workspace как структурированный результат взаимодействия пользователя с ARVELIS AI.

Геометрия логотипа не менялась: геометрическая `A`, круговая орбита и точечная дуга сохранены. Для светлого пользовательского UI добавлен отдельный teal/blue gradient colorway.

## Текущий engineering slice

`feat/travel-ui-redesign-v2` является stacked UI/UX slice поверх `feat/travel-foundation-v1`.

Активный пользовательский контур:

- AI-first Home;
- ARVELIS AI — general travel context;
- Мои поездки;
- Создать поездку;
- Trip Workspace;
- Route / Map / Budget / Documents / Legal / Trip Book;
- Profile;
- Settings / Help;
- dev-only `Settings → Advanced / Diagnostics`.

Primary navigation — left side drawer. Legacy bottom navigation больше не является активной Travel navigation model.

## AI truth boundary

Реальный AI Gateway в этом slice **не подключён**.

- General ARVELIS AI и trip-scoped ARVELIS AI разделены контекстно.
- Пользовательский запрос может отображаться в UI, но fake assistant answer не создаётся.
- При отсутствии AI показывается честное состояние `ARVELIS AI пока не подключён`.
- Transport, Map, Legal, Weather, Stay, Currency и PDF providers не подключены.
- Fake flights, prices, hotels, visa rules, maps и AI recommendations запрещены.

## Trip foundation

Существующие Travel contracts и local persistence сохранены без UI-driven redesign:

- `Trip`;
- `Traveler`;
- `TripPreferences`;
- `DestinationOption`;
- `TransportRoute` / `TransportSegment`;
- `ItineraryDay` / `ItineraryItem`;
- `Budget` / `BudgetItem`;
- `LegalCheck` / `LegalRequirement` / `LegalSource`;
- `MapPoint`;
- `TripBook`.

`TripRepository` по-прежнему сохраняет user-created Trip drafts локально и изолирует их по `ownerScopeId`. Server Trip Persistence не входит в этот slice.

## Auth foundation

Существующая auth foundation сохранена:

- passwordless Email OTP;
- same-origin Auth API;
- HttpOnly server session;
- SQLite для development/closed test;
- PostgreSQL-compatible persistence;
- protected OTP/session peppers и SMTP credentials;
- `VITE_REAL_AUTH_ENABLED=false` до отдельного rollout решения.

## Development

Frontend:

```bash
npm run dev
```

Закрытый Email OTP runtime после настройки protected environment:

```bash
npm run dev:auth
```

## Verification

Основной pipeline:

```bash
npm ci
npm audit --audit-level=high
npm run typecheck
npm run test:auth
npm run test:server-auth
npm run test:server-sqlite
npm run test:travel
npm run build:auth-server
npm run build
```

`npm run test:travel` включает V2 UI contract smoke и headless Chromium acceptance. Browser acceptance проверяет `390×844`, `844×390`, `360×800`, `1440×900`.

Полный локальный check:

```bash
npm run check
```

## Security / release boundary

- `.env`, SQLite data, SMTP password, OTP/session peppers, API keys и production credentials не коммитятся.
- Реальный AI и реальные travel providers не подключаются в V2.
- Merge в `main` и production publish выполняются только после отдельного подтверждения.
- Physical iPhone Safari / VoiceOver smoke остаётся отдельным manual acceptance item, если соответствующая среда недоступна в automated runner.

См. `docs/04_UI_GUIDE.md`, `docs/07_DECISIONS.md`, `docs/08_BRAND_ASSETS.md`, `docs/42_TRAVEL_PIVOT_FOUNDATION_V1.md` и `docs/43_TRAVEL_UI_REDESIGN_V2.md`.
