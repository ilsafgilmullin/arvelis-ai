# ARVELIS AI — Travel MVP readiness gates

**Актуальность:** 2026-09-08 Travel Product Pivot.

Этот документ отделяет утверждённый Travel product contract от ещё не выбранных provider/production решений. Реальный AI и real-data integrations не подключаются автоматически после закрытия Foundation V1.

Статусы: `APPROVED`, `FOUNDATION`, `OPEN`.

## 1. Целевой пользователь — APPROVED

Русскоязычный самостоятельный путешественник: solo, пары, семьи, небольшие группы; Россия + international; iPhone/Android/desktop; бюджетные ограничения — важный сценарий.

## 2. Главная проблема — APPROVED

Объединить разрозненные решения по бюджету, транспорту, времени, комфорту, legal, карте и программе в один проверяемый Trip plan, не маскируя предположения под факты.

## 3. Основной сценарий — APPROVED

Пользователь задаёт origin/destination или просит подобрать направление, даты/гибкость, duration, travelers, budget и preferences → ARVELIS в будущем оркестрирует Plan/Transport/Budget/Legal/Map/Itinerary → формирует Trip Book.

## 4. Границы MVP — APPROVED / staged

Approved product boundaries:

- Plan/Discover;
- Transport;
- Budget;
- Legal;
- Map;
- Itinerary;
- Trip Book.

Future, not base MVP Foundation: Live Companion, Safe, AR/offline maps, camera/realtime voice, Travel Memory, full Group Travel.

## 5. Модель данных — FOUNDATION

Foundation domain types существуют для Trip/Traveler/Preferences/Destination/Transport/Itinerary/Budget/Legal/Map/TripBook.

`localStorage` — только current Travel Foundation persistence. Production Trip schema/server repository — `OPEN`.

## 6. Уровни доступа — FOUNDATION / OPEN

Existing Email OTP Account/Session foundation server-authoritative. Current Travel data is scoped locally.

Production Travel authorization, sharing/group roles и admin permissions — `OPEN`.

## 7. Security/privacy — FOUNDATION / OPEN

Approved invariants находятся в `docs/05_SECURITY.md`. До real providers остаются open: exact data categories, document policy, retention, provider transfer rules, production region, consent/legal package.

## 8. Key screens — FOUNDATION

Travel Foundation includes Home, My Trips, Create Trip, Trip Workspace, Profile and truthful provider-empty states.

Physical acceptance on iPhone/Android/desktop remains QA work; Foundation UI is not declared final production design.

## 9. Release criteria — OPEN

Before any real AI/data MVP release separately approve:

- selected providers and fallback policy;
- quality/accuracy metrics;
- source verification policy;
- latency/error budgets;
- privacy/security review;
- rate/cost controls;
- observability/audit;
- server Trip persistence/backup/recovery;
- mobile/desktop acceptance;
- closed-beta rollback criteria.

## Gate for real AI/providers

Travel Pivot Foundation V1 does **not** grant permission to connect OpenAI/Gemini/Claude, transport/booking, paid map, production legal/weather/stay/currency APIs or paid infrastructure. Every provider integration remains a separate reviewed slice.
