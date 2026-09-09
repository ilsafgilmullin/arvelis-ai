# ARVELIS AI

**ARVELIS AI — AI-first Travel Assistant** для русскоязычных самостоятельных путешественников.

Слоган: `INTELLIGENCE. PRECISION. RESULTS.`

Текущий пользовательский Travel UI — light AI-first: white / soft blue-white surfaces, teal/blue/green palette, side drawer и Trip Workspace. Геометрия бренда не менялась: `A`, круговая орбита и точечная дуга сохранены.

## Текущий engineering slice

`Server-side Trip Persistence & API V1` развивается в stacked-ветке `feat/travel-trip-persistence-v1` поверх `feat/travel-ui-redesign-v2`.

Цель slice — заменить local-only persistence для реально аутентифицированного аккаунта на server-authoritative account-scoped Trip persistence, сохранив существующий Trip domain и UI repository boundary.

Реализовано:

- `GET /api/trips` — список Trip только текущего authenticated account;
- `GET /api/trips/:id` — чтение Trip только в account scope;
- `PUT /api/trips/:id` — создание/обновление Trip с server-side ownership;
- SQLite adapter для development/closed test;
- PostgreSQL-compatible adapter;
- additive migration `002_travel_trip_persistence`;
- server-authoritative `createdAt` / `updatedAt`;
- real-auth frontend использует same-origin HTTP Trip repository;
- preview mode остаётся отдельным local-only контуром;
- server failure не маскируется fallback-записью в `localStorage`.

Удаление Trip через API в V1 намеренно не добавлено.

## Ownership / security boundary

`ownerScopeId` из клиентского payload не является доказательством владения. Account ID определяется только из проверенной HttpOnly session.

- foreign-owned payload отклоняется;
- одинаковый Trip ID может существовать у разных аккаунтов, потому что storage key account-scoped;
- mutations проходят существующий same-origin request guard;
- Trip JSON имеет bounded request size и проходит runtime validation;
- `.env`, database credentials, SMTP password, OTP/session peppers и будущие provider keys не попадают в frontend/repository.

## Persistence model

V1 сохраняет `Trip` как валидированный aggregate document, не раскладывая текущий domain на десятки таблиц раньше времени.

- SQLite: account-scoped row + JSON document;
- PostgreSQL: account-scoped row + `jsonb` document;
- account ID, timestamps и ownership metadata — server-authoritative;
- migration additive, без destructive DROP/irreversible data changes.

Это позволяет позже нормализовать отдельные подсистемы Plan/Transport/Budget/Legal без UI-driven переписывания текущего Trip contract.

## AI truth boundary

Реальный AI provider в этом slice **не подключён**.

General и trip-scoped ARVELIS AI остаются truthful UI contexts: пользовательский prompt может быть принят интерфейсом, но fake assistant answer не создаётся. Transport, Map, Legal, Weather, Stay, Currency и PDF providers также не подключены.

Следующий согласованный этап после полного DoD persistence slice — **Plan real-data contract / AI orchestration policy**. Это contract/policy этап, а не разрешение подключить конкретного AI vendor.

## Auth foundation

Существующая passwordless Email OTP foundation сохранена:

- same-origin API;
- HttpOnly server session;
- server-authoritative Account/Session;
- SQLite для development/closed test;
- PostgreSQL-compatible persistence;
- secrets только в protected environment.

В рамках security maintenance Nodemailer обновлён до `9.1.1`; `npm audit --audit-level=high` должен оставаться зелёным.

## Development

Frontend preview:

```bash
npm run dev
```

Closed-test real-auth runtime после настройки protected environment:

```bash
npm run dev:auth
```

## Verification

Основной persistence gate:

```bash
npm ci
npm audit --audit-level=high
npm run typecheck
npm run test:trip-server
npm run build:auth-server
npm run test:travel-browser
npm run build
```

Pull request дополнительно запускает PostgreSQL 18.4 gate:

```bash
npm run db:migrate
npm run test:trip-postgres
```

Browser happy-path использует реальный closed-test контур `HttpOnly session → same-origin /api/trips → SQLite → reload → reopen` на mobile viewport `390×844`, а не localStorage-only preview.

## Release boundary

- merge в `main` не выполняется без отдельного подтверждения;
- production deploy не выполняется;
- production DB/provider region, backup/retention и public registration остаются отдельными решениями;
- paid services и реальные AI/travel providers не подключаются этим slice.

См. `docs/02_ARCHITECTURE.md`, `docs/03_ROADMAP.md`, `docs/05_SECURITY.md`, `docs/07_DECISIONS.md`, `docs/43_TRAVEL_UI_REDESIGN_V2.md` и `docs/44_TRAVEL_TRIP_PERSISTENCE_API_V1.md`.
