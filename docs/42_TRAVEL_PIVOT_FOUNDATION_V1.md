# Travel Pivot Foundation V1 — engineering record

Date: 2026-09-08.

## Pre-change audit

Repository: `ilsafgilmullin/arvelis-ai`.

Factual stable base at branch creation:

- `main`: `83d3795f118642690b2a451ca0ca736e8253e283`;
- branch created: `feat/travel-foundation-v1`;
- root contains npm lockfile, Vite React frontend, server auth/db/runtime, tests, Replit and CI configuration;
- package: React 19.2.8, React DOM 19.2.8, TypeScript 6.0.3, Vite 8.2.1, Node `>=22.12.0 <27`;
- `.replit`: Node 22, `npm ci --include=dev --no-audit --no-fund && npm run dev`, port 3000;
- Vite same-origin `/api` proxy → `127.0.0.1:3001`, sensitive filesystem deny rules;
- auth env contract contains SQLite/PostgreSQL, OTP/session peppers, SMTP and rollout flag only; no Travel API secrets.

The execution container used for this engineering pass could not resolve `github.com` through direct shell DNS, so a conventional local `git clone/status` was not available. Remote repository/refs/files/PRs were audited through the authenticated GitHub connector; build/test commands were executed by GitHub Actions on the PR head. No claim is made that a separate local checkout was clean.

## Open PR audit

- #22 — auth runtime finalization: useful auth infrastructure, still Draft/unmerged; not used as base.
- #23 — old Home foundation: useful local-data patterns, but product model is pre-Travel.
- #24 — Chat-oriented workspace/domain: substantial Chat-specific code; not suitable as Travel root.
- #25 — server conversation persistence/rate limit foundation: secure patterns may be reusable, but Conversation/Message is Chat-specific and not the Trip domain.

PRs #22–#25 were not merged, closed, force-pushed or rewritten.

## Preserved architecture

- ARVELIS brand mark/lockup and tagline;
- Welcome/Auth/RealAuth screens;
- Email OTP contracts/transport/server runtime;
- Account/Session and session management UI;
- SQLite closed-test auth persistence;
- PostgreSQL-compatible auth persistence;
- Vite/Replit security configuration;
- existing tests and CI jobs;
- legacy Chat files remain in repository.

## Added Travel foundation

- `src/travel/domain.ts`;
- `src/travel/storage.ts`;
- `src/travel/providers.ts`;
- `src/travel/TravelApp.tsx`;
- `src/travel/travel-foundation-v1.css`;
- `tests/travel-foundation-smoke.ts`;
- `tsconfig.travel-smoke.json`;
- `npm run test:travel` + CI step.

## Data truth boundary

A newly created Trip contains only user-supplied fields plus deterministic structural metadata/status. Foundation initializes provider-derived collections empty:

- no destination recommendations;
- no transport routes;
- no itinerary items;
- no legal requirements;
- no map points;
- no automatic price items.

UI states explicitly state when AI/provider functionality is absent.

## Ownership boundary

Current browser `TripRepository` namespaces storage by account/local-preview scope and validates `ownerScopeId`. Cross-scope writes and forged foreign-owned reads are tested.

This is defense-in-depth for local Foundation only. A future server repository must derive owner from authenticated server session and never trust a client ownership id.

## Verification contract

Travel smoke covers:

- Create Trip input validation;
- draft/status construction;
- budget calculation;
- local save/list/reopen;
- ownership isolation;
- mock/provider truthfulness;
- viewport classification logic.

The PR workflow additionally runs existing auth, SQLite and PostgreSQL compatibility checks plus TypeScript/audit/build.

Physical iPhone/Android/desktop visual acceptance remains a user/device QA step; it cannot be truthfully inferred from CI alone.
