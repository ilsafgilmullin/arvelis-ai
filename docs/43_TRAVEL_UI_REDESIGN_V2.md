# ARVELIS AI — Travel UI Redesign V2

Date: `2026-09-08`

Branch: `feat/travel-ui-redesign-v2`

Base: `feat/travel-foundation-v1`

Foundation base SHA: `17a3f726734ec3d175268bccf5ae868f25062c27`

## Purpose

V2 is a UI/UX engineering slice on top of Travel Pivot Foundation V1. It does not replace the Travel domain, auth/server foundation or local Trip repository.

The product presentation changes from a dark Trip-first dashboard to a **light AI-first Travel Assistant**:

`Home → ARVELIS AI → Trip → structured Trip Workspace`.

The assistant is the primary interaction surface. Trip Workspace remains the structured, persisted product object/result.

## Boundaries preserved

Unchanged by design:

- `src/travel/domain.ts` contracts;
- `TripRepository` local persistence and `ownerScopeId` isolation;
- provider-neutral `AIProvider`, `TransportProvider`, `MapProvider`, `LegalSourceProvider`, `WeatherProvider`, `StayProvider`, `CurrencyProvider` boundaries;
- passwordless Email OTP foundation;
- HttpOnly server sessions;
- same-origin auth API;
- SQLite closed-test adapter and PostgreSQL compatibility.

V2 does not introduce server Trip persistence.

## Presentation architecture

Active Travel presentation is split into focused modules:

- `src/travel/TravelApp.tsx` — screen state, navigation, repository integration, assistant routing and drawer lifecycle;
- `src/travel/HomeTripsScreens.tsx` — AI-first Home and My Trips;
- `src/travel/CreateTripScreen.tsx` — create/save presentation using existing validation/domain;
- `src/travel/AssistantScreen.tsx` — general/trip-scoped assistant UI and truthful states;
- `src/travel/TripWorkspace.tsx` — overview, itinerary, map, budget, documents, legal and Trip Book;
- `src/travel/ServiceScreens.tsx` — provider/service foundations, Settings and Help;
- `src/travel/assistantContext.ts` — UI boundary for future AI Gateway contexts;
- `src/travel/ui.tsx` — presentation constants/helpers shared by Travel screens.

This split prevents `TravelApp.tsx` from becoming a monolithic provider/domain implementation.

## Assistant contexts

### General

`createGeneralAssistantContext(source)` creates a general Travel Assistant context.

Use cases:

- destination discovery;
- budget-first travel questions;
- legal/transport questions before a Trip exists;
- general planning.

No Trip domain object is required.

### Trip-scoped

`createTripAssistantContext(trip)` maps existing Trip state into the UI context needed by a future AI Gateway:

- `tripId`;
- origin/destination;
- dates/duration;
- traveler count;
- budget limit;
- preferences;
- itinerary state;
- legal state;
- map state.

The current UI does not call an AI provider. This boundary exists so later Gateway integration does not require rewriting the assistant presentation.

## AI truth model

Supported UI statuses:

- empty;
- user message;
- loading;
- error;
- offline;
- provider unavailable;
- AI not connected.

In V2 the normal online submitted state resolves to **AI not connected**, because a real Gateway is outside scope.

No mock assistant reply is generated.

## Navigation architecture

Primary bottom navigation is removed from the active Travel shell.

Primary navigation is a left side drawer:

- Главная;
- ARVELIS AI;
- Мои поездки;
- Создать поездку;
- Документы;
- services group;
- account group.

Drawer implementation includes:

- `aria-expanded` / `aria-controls` on trigger;
- modal dialog semantics while open;
- overlay pointer dismiss;
- Escape close;
- Tab / Shift+Tab focus trap;
- body scroll lock and exact restoration;
- focus return to menu trigger;
- safe-area-aware drawer padding;
- reduced motion behavior.

## Home

Home is AI-first:

- `Куда отправимся?`;
- large composer;
- starter prompts;
- starter prompt fills the composer only;
- no voice/attachment buttons before implementation;
- recent user Trips or truthful empty state;
- static editorial inspiration is not presented as AI personalization.

## My Trips / Create Trip

My Trips uses light neutral cards and does not attach fake destination photography to user drafts.

Create Trip keeps the Foundation V1 save path:

`validateCreateTripInput → createTripDraft → TripRepository.save → repository.list/reopen`.

The working CTA is `Сохранить поездку`.

AI search CTA is not shown as operational.

## Trip Workspace

Context tabs:

- Обзор;
- Маршрут;
- Карта;
- Бюджет;
- Документы;
- Legal;
- Trip Book.

`Спросить ARVELIS` opens the same assistant presentation with trip-scoped context instead of adding AI as an eighth tab.

Tab strip supports internal horizontal scroll on mobile plus ArrowLeft / ArrowRight / Home / End keyboard navigation.

## Provider truth states

V2 deliberately renders absence instead of demo results:

- itinerary empty state;
- schematic non-geographic Map placeholder when map provider is absent;
- user-entered budget limit without invented prices;
- Legal not-run state with future source/date/status structure;
- no fake Documents;
- Trip Book content structure without fake PDF export.

## Profile / Settings

Profile is reduced to user-facing account information:

- avatar;
- name/account identity;
- profile edit where local preview permits it;
- personal data;
- travel preferences;
- security;
- documents;
- notifications;
- privacy;
- help/about;
- logout.

Technical diagnostics no longer dominate Profile.

Diagnostics are exposed only in development mode through:

`Settings → Advanced / Diagnostics`.

## Visual system

V2 CSS layers load after Travel Foundation styles:

1. `travel-v2-shell.css`;
2. `travel-v2-home.css`;
3. `travel-v2-workspace.css`;
4. `travel-v2-responsive.css`.

Core properties:

- light background;
- teal/blue primary gradient;
- restrained green state accent;
- white cards;
- soft borders/shadows;
- accessible text contrast;
- 44px touch token;
- 48px input token;
- safe areas;
- no horizontal page overflow;
- reduced motion.

## Brand implementation

`BrandMark` now supports `classic` and `travel` color variants.

The geometry paths/circles are unchanged. `useId()` provides per-instance SVG gradient IDs so multiple marks can render on the same document without gradient collisions.

Clean light technical assets:

- `public/brand/logo-mark-light.svg`;
- `public/brand/logo-mark-light-small.svg`.

These are not a replacement master lockup.

## Tests

`tests/travel-ui-contract-smoke.mjs` validates static V2 architecture/contracts, including:

- AI-first navigation;
- no active bottom nav;
- drawer accessibility lifecycle;
- local Trip save/reopen path;
- truthful provider/AI states;
- general/trip context split;
- Profile diagnostics boundary;
- logo geometry/color variant;
- tokens, safe areas and responsive/reduced-motion rules.

`tests/travel-browser-acceptance.mjs` runs the real React UI in headless Chromium and covers:

- `390×844`;
- `844×390`;
- `360×800`;
- `1440×900`;
- drawer focus/close lifecycle;
- general AI truthful state;
- create/save/reopen Trip;
- trip-scoped AI truthful state;
- Route/Map/Budget/Documents/Legal/Trip Book;
- Profile;
- horizontal overflow;
- visible interactive target sizes;
- responsive tabs;
- runtime exceptions / `console.error`.

Chromium does not replace physical Safari / VoiceOver testing.

## Explicitly out of scope

Not implemented in V2:

- real AI Gateway/provider;
- RAG / Knowledge Base;
- real flight/train/bus providers;
- booking;
- real map SDK/provider;
- production Legal provider;
- weather/currency APIs;
- server Trip persistence;
- PDF generation;
- billing;
- production deploy.

The next engineering slice requires a separate user decision. V2 stops after its Definition of Done.
