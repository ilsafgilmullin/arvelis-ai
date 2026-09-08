# ARVELIS AI — архитектура

**Актуальность:** Travel Pivot Foundation V1, 2026-09-08.

## Принципы

- mobile-first frontend;
- `Trip` — основной продуктовый агрегат;
- UI, domain, persistence, provider adapters, auth, audit и analytics разделяются;
- внешние AI/travel providers заменяемы;
- server-authoritative auth сохраняется отдельным контуром;
- account-scoped data access — обязательное требование для будущей server persistence;
- demo/mock и real provider data имеют явную границу;
- секреты только в protected environment;
- legacy Chat не определяет Travel domain.

## Фактический stack после pre-change audit

- React `19.2.8`;
- React DOM `19.2.8`;
- TypeScript `6.0.3`;
- Vite `8.2.1`;
- `@vitejs/plugin-react 6.0.5`;
- Node requirement `>=22.12.0 <27`; CI runtime Node `24.19.0`;
- npm lockfile существует и используется CI через `npm ci`;
- Vite dev/preview: `0.0.0.0:3000`;
- `/api` same-origin proxy → auth server `127.0.0.1:3001`;
- frontend router dependency отсутствует: текущий shell использует explicit application state navigation;
- server runtime уже содержит auth/db/persistence/runtime boundaries;
- development/closed-test auth persistence: SQLite;
- PostgreSQL-compatible auth persistence проверяется отдельным CI job.

Это фактический foundation stack. Выбор production Travel infrastructure/providers остаётся отдельным решением.

## Travel frontend boundary

Новый модуль `src/travel/` содержит:

- `domain.ts` — типы, Trip validation, statuses, Budget calculation, truth capability state;
- `storage.ts` — local account-scope repository boundary;
- `providers.ts` — provider-neutral interfaces;
- `TravelApp.tsx` — Travel composition/navigation layer;
- `travel-foundation-v1.css` — mobile-first Travel UI layer.

Travel domain не импортирует React-компоненты.

## Trip domain

Foundation предусматривает:

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

Типы достаточно отделены от UI, чтобы заменить local persistence на server repository без изменения пользовательской информационной архитектуры.

## Provider-neutral interfaces

Будущие integrations подключаются через contracts:

- `AIProvider`;
- `TransportProvider`;
- `MapProvider`;
- `LegalSourceProvider`;
- `WeatherProvider`;
- `StayProvider`;
- `CurrencyProvider`.

Foundation не содержит vendor implementation и API keys.

## Persistence V1

В текущем slice Trip drafts хранятся в browser `localStorage` через `TripRepository`.

Правила:

- real-auth scope использует server Account ID как ownership namespace;
- preview использует отдельный стабильный local preview scope;
- repository отклоняет запись Trip с чужим `ownerScopeId`;
- при чтении foreign-owned/invalid payload отбрасывается;
- user-created data не смешивается с sample content;
- этот storage **не является production Trip database** и не синхронизируется между устройствами.

Следующий server persistence slice должен реализовать тот же ownership contract server-side, а не доверять client-supplied account identity.

## Auth — сохранённая архитектура

Travel pivot не переписывает существующую Email OTP foundation.

Сохраняются:

- passwordless Email OTP;
- trusted server verification;
- raw OTP не хранится/не логируется;
- independent OTP/session peppers;
- HttpOnly session cookie;
- same-origin API;
- server-authoritative Account/Session;
- SQLite test adapter;
- PostgreSQL-compatible adapter;
- environment-only SMTP/secret configuration.

PR #22 содержит отдельную ещё не слитую auth-runtime finalization работу и не использовался как base Travel V1.

## Legacy Chat

Исторический Chat frontend/domain/storage остаётся в repository, потому что:

1. его удаление не требуется для Travel Foundation;
2. связанные PR #23–#25 остаются открытыми stacked branches;
3. отдельные interaction/persistence patterns могут пригодиться позже для trip-scoped assistant layer.

Однако `App.tsx` больше не загружает Chat как центральный core module, а старые Chat/Home/History решения считаются product-superseded.

Chat не должен получать новые функции в Travel Foundation V1.

## Map / Legal truth boundary

Map UI может отображать только реальные points/provider results или честный empty state. Фиктивная карта запрещена.

Legal data должна быть отдельным domain boundary и в будущем содержать минимум:

- country;
- requirement type;
- summary;
- source name/url;
- verifiedAt;
- effectiveFrom/effectiveUntil;
- confidence/status.

Юридические правила не хардкодятся в AI prompt как источник истины.

## Performance model

- Home/Create не зависят от heavy map SDK;
- real map/provider modules должны подключаться lazy/on-demand;
- Travel Foundation не добавляет новые runtime dependencies;
- Profile/System States остаются lazy modules;
- first render не ждёт real provider calls.

## Replit

`.replit` использует Node 22 module, выполняет `npm ci --include=dev --no-audit --no-fund && npm run dev` и публикует local port `3000` на external `80`.

Vite запрещает serving `.env`, `.data`, sqlite/WAL/SHM, private keys и `.git` из project root.

Replit Agent для обычной разработки не нужен; source of truth остаётся GitHub.

## CI

PR в `main` запускает:

- `npm ci`;
- `npm audit --audit-level=high`;
- TypeScript typecheck;
- auth core smoke;
- server Email OTP smoke;
- SQLite auth persistence smoke;
- Travel foundation smoke;
- auth server build;
- frontend build;
- отдельный PostgreSQL migration/persistence job на PostgreSQL 18.4.

## Production boundaries still open

- server Trip repository/API;
- selected provider implementations and routing/fallback policy;
- observability/audit for provider calls;
- document storage/retention;
- production region/hosting;
- legal/privacy package;
- billing and quotas.
