# ARVELIS AI — архитектура

**Актуальность:** Server-side Trip Persistence & API V1, 2026-09-09.

## Принципы

- mobile-first frontend;
- `Trip` — основной продуктовый агрегат;
- UI, domain, persistence, provider adapters, auth, audit и analytics разделены;
- server-authoritative ownership не доверяет client-supplied account identity;
- внешние AI/travel providers заменяемы;
- demo/mock и real provider data имеют явную границу;
- секреты только в protected environment;
- legacy Chat не определяет Travel domain.

## Фактический stack

- React `19.2.8`;
- React DOM `19.2.8`;
- TypeScript `6.0.3`;
- Vite `8.2.1`;
- Node requirement `>=22.12.0 <27`; CI runtime Node `24.19.0`;
- `pg 8.23.0`;
- Nodemailer `9.1.1` после security patch;
- npm lockfile используется через `npm ci`;
- Vite dev: `0.0.0.0:3000`;
- same-origin `/api` proxy → trusted server runtime `127.0.0.1:3001`;
- development/closed-test persistence: SQLite;
- PostgreSQL 18.4 compatibility проверяется отдельным PR gate.

## Travel frontend boundary

`src/travel/` содержит domain/UI/repository contracts. Persistence selection происходит за repository boundary:

- preview mode → browser local repository;
- authenticated real mode → `HttpTripRepository` через same-origin `/api/trips`;
- server error не переводит real-auth пользователя скрыто обратно на local persistence.

`TravelApp` использует asynchronous repository operations и не знает конкретный DB adapter.

## Trip domain

Существующий `Trip` contract сохранён. В него входят параметры поездки, travelers, preferences, destination options, transport routes, itinerary, budget, legal checks, map points и Trip Book.

Server persistence V1 не нормализует каждый вложенный объект в отдельную таблицу. Причина: текущий aggregate ещё развивается, а преждевременная нормализация связала бы UI/domain evolution с DB schema.

## Server Trip application boundary

`server/travel/` содержит:

- runtime validation входящего Trip document;
- `TripApplicationService`;
- account-scoped `ServerTripStore` contract;
- application errors `invalid_input` / `access_denied`;
- server-authoritative normalization ownership/timestamps.

Правила:

1. `accountId` приходит только из authenticated server session.
2. `tripId` из path обязан совпадать с document ID.
3. payload `ownerScopeId` обязан совпадать с authenticated account; foreign ownership отклоняется.
4. `createdAt` при первой записи задаёт сервер; при update сохраняется исходный server value.
5. `updatedAt` задаёт сервер при каждой записи.
6. invalid/oversized payload fail closed.

## HTTP API V1

Same-origin endpoints:

- `GET /api/trips`;
- `GET /api/trips/:id`;
- `PUT /api/trips/:id`.

Mutations используют существующий `X-Arvelis-Request` + same-origin guard. Неаутентифицированный доступ получает `401`; foreign payload не становится способом сменить владельца.

`DELETE` намеренно отсутствует в V1: deletion/retention semantics требуют отдельного решения.

## SQLite persistence

`travel_trips` создаётся additive migration `002_travel_trip_persistence` поверх auth schema.

Логическая запись:

- `account_id`;
- `id`;
- `document_json`;
- `created_at`;
- `updated_at`;
- composite primary key `(account_id, id)`;
- foreign key на `auth_accounts`.

SQLite используется только для development/closed test, но проверяет реальную server persistence/ownership boundary.

## PostgreSQL persistence

PostgreSQL adapter реализует тот же `ServerTripStore` contract. `travel_trips.document_json` хранится как `jsonb`; account/timestamps остаются отдельными authoritative columns.

`002_travel_trip_persistence.sql` применяется после неизменённой `001_auth_foundation.sql`. Migration runner хранит checksum каждого migration и выполняет их под advisory transaction lock. Migration additive и не содержит destructive DROP/irreversible transforms.

## Auth — сохранённая архитектура

Travel persistence расширяет существующий trusted server, но не переписывает Email OTP/Auth:

- passwordless Email OTP;
- raw OTP не хранится/не логируется;
- independent OTP/session peppers;
- HttpOnly session cookie;
- server-authoritative Account/Session;
- SQLite/PostgreSQL auth adapters;
- environment-only SMTP/secret configuration.

## Provider-neutral interfaces

Следующие providers остаются contracts без vendor implementation:

- `AIProvider`;
- `TransportProvider`;
- `MapProvider`;
- `LegalSourceProvider`;
- `WeatherProvider`;
- `StayProvider`;
- `CurrencyProvider`.

Следующий согласованный slice — Plan real-data contract / AI orchestration policy. Он должен определить trusted data/orchestration boundary до подключения реальной модели или внешнего provider.

## Map / Legal truth boundary

Map отображает только реальные provider points либо truthful unavailable state. Legal result без проверенного source не считается достоверным. AI не является authoritative legal source.

## CI / acceptance

Push gate для persistence branch:

- `npm ci`;
- `npm audit --audit-level=high`;
- `npm run typecheck`;
- `npm run test:trip-server` — SQLite migration/business/ownership;
- `npm run build:auth-server`;
- `npm run test:travel-browser` — один реальный server-backed Chromium happy-path;
- `npm run build`.

PR gate дополнительно запускает PostgreSQL 18.4:

- `npm run db:migrate`;
- `npm run test:trip-postgres`.

CI имеет только `contents: read`; self-mutating workflow step удалён.

## Production boundaries still open

- production DB provider/region;
- backup/restore/retention/export/deletion policy;
- provider implementations and routing/fallback policy;
- provider-call observability/audit;
- travel-document storage/retention;
- legal/privacy package;
- billing/quotas;
- production deployment/public registration.
