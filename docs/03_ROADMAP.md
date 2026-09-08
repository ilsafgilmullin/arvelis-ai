# ARVELIS AI — дорожная карта

**Актуальность:** 2026-09-08.

Предыдущая universal/chat-first roadmap superseded решением `Travel Product Pivot`. Исторические этапы и PR не удаляются.

## Foundation, уже сохранённый из предыдущих этапов

- [x] ARVELIS AI name/tagline/graphite-gold brand.
- [x] Clean brand mark assets used by UI.
- [x] React + TypeScript + Vite frontend foundation.
- [x] Mobile-first/safe-area/reduced-motion UI hardening.
- [x] Passwordless Email OTP domain/server foundation.
- [x] Account/Session foundation.
- [x] SQLite closed-test auth persistence.
- [x] PostgreSQL-compatible auth persistence.
- [x] Replit runtime configuration.
- [x] CI/npm lockfile/build/test foundation.

## Travel Pivot Foundation V1 — CURRENT SLICE

- [x] Travel vertical / target user / main problem / main flow fixed.
- [x] `Trip` becomes primary domain object.
- [x] Travel-first Home.
- [x] `Мои поездки`.
- [x] mobile-first `Создать поездку` flow.
- [x] local user-created Trip draft persistence.
- [x] reopen saved Trip.
- [x] Trip Workspace.
- [x] Overview foundation.
- [x] Itinerary foundation with truthful empty state.
- [x] Map provider-neutral foundation with truthful empty state.
- [x] Budget domain/calculation foundation.
- [x] Legal source/domain foundation.
- [x] Trip Book frontend representation.
- [x] provider-neutral interfaces for AI/Transport/Map/Legal/Weather/Stay/Currency.
- [x] Travel domain/storage/truthfulness/ownership smoke tests.
- [x] Existing auth/server foundations preserved.
- [x] universal/chat-first positioning marked superseded in current docs.
- [ ] physical iPhone portrait/landscape smoke of this exact Travel PR by the user.
- [ ] physical Android narrow viewport smoke.
- [ ] desktop browser visual smoke.

The unchecked device checks are acceptance QA, not permission to add more product scope inside this slice.

## Next logical slice — NOT STARTED

Server-side Trip persistence/API with server-authoritative account ownership, replacing local-only Travel persistence behind a repository boundary.

Do not start it automatically after this PR.

## Later Travel sequence — product direction, not current work

1. destination/Plan real-data contract and AI orchestration policy;
2. Transport providers and normalized route comparison;
3. Budget provider inputs and currency handling;
4. Legal source ingestion/verification;
5. Map provider implementation;
6. Stay/Weather integrations where justified;
7. Trip Book export/generation;
8. Live Companion;
9. Safe/emergency capabilities.

Each external provider is a separate engineering/security/legal decision. No paid integration is implied by this roadmap.

## Explicitly not in current slice

- real AI provider;
- booking/ticket purchase;
- production transport/stay/map/legal/weather APIs;
- payments/billing/subscriptions;
- production deployment/public registration rollout;
- AR/offline maps;
- Live/Safe automation;
- camera/realtime voice;
- Travel Memory/full Group Travel.
