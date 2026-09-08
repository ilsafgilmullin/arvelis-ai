# ARVELIS AI — UI Guide

## Visual direction — unchanged brand

- deep black/graphite background;
- gold is an accent/status signal, not a full-surface fill;
- strict clean geometry;
- professional premium feel without theatrical luxury;
- restrained shadows/glow/motion;
- strong readability and contrast;
- approved ARVELIS A/orbit/dotted-arc geometry is not redesigned.

Travel pivot must not turn ARVELIS into a generic blue tourism site.

## Travel visual language

Travel context is expressed through useful product information:

- destinations;
- future verified place photography;
- transport indicators;
- budget structure;
- itinerary/timeline;
- real map provider data;
- Trip Book structure.

Forbidden travel clichés:

- decorative palm trees/airplanes as brand replacement;
- bright blue gradients;
- fake maps/routes;
- postcard-style visual noise;
- invented booking cards/prices.

Existing generic forbidden patterns remain: acid neon, overloaded space backgrounds, futuristic HUD, excessive glow, cheap 3D robots, random gold frames and chatbot cloning.

## Information architecture

Primary V1 contour:

`Главная · Поездки · Создать · Профиль`

Trip Workspace contains:

- Обзор;
- Маршрут;
- Карта;
- Бюджет;
- Документы;
- Legal;
- Trip Book.

Chat is not a primary navigation item in Travel Foundation V1. A future chat/assistant surface may exist only as a trip-scoped interaction layer after a separate product decision.

## Home

Home must prioritize:

1. ARVELIS brand;
2. concise AI Travel Assistant positioning;
3. primary CTA `Создать поездку`;
4. recent user-created trips if present;
5. honest empty state if not;
6. clear entry to `Мои поездки`.

No fake statistics, fake AI results, seeded conversations or invented prices.

## Create Trip

The form is mobile-first and grouped into understandable blocks instead of one dense questionnaire.

Required foundation inputs:

- origin;
- destination or `Не знаю куда`;
- dates or flexible dates;
- duration;
- traveler count;
- budget;
- vacation type;
- interests;
- transport preferences;
- additional wishes.

Rules:

- fields have visible labels;
- numeric/date inputs use suitable mobile input types;
- disabled state is explicit for flexible/unknown choices;
- errors appear next to the relevant field/group;
- draft-save is a real local operation, not an AI action;
- no fake progress like «ищем лучшие билеты» while no provider exists.

## Trip cards

Cards show only persisted Trip data:

- title/direction;
- dates/flex dates;
- status;
- traveler count/duration;
- user budget limit;
- updated time.

## Empty/provider states

If a provider does not exist, the UI says so directly.

Examples:

- itinerary: plan not generated;
- map: provider not connected;
- Legal: check not run, use official sources;
- Budget: automatic prices absent;
- Documents: upload/processing not included.

A placeholder must never visually impersonate a completed provider result.

## Mobile-first

- iPhone top/bottom/left/right safe areas;
- minimum practical touch target ≈44px;
- no horizontal page overflow;
- horizontal tab scroller only where intentional;
- fixed bottom navigation leaves content padding below it;
- sticky form actions must not collide with bottom nav;
- phone landscape stays a phone layout;
- explicitly harden 320–360px widths;
- narrow Android viewport follows the same touch/overflow contract;
- desktop is a separate layout adaptation, not a stretched mobile screen.

## Keyboard/forms

- inputs remain readable on iPhone without accidental zoom;
- page/form scroll must allow the focused field to remain reachable;
- no fixed-element collision with software keyboard;
- submit validation is deterministic and does not silently discard data.

## Accessibility

- semantic `button`, `nav`, `main`, `form`, `label` elements;
- `aria-pressed` for toggle chips;
- `aria-selected` for workspace tabs;
- `aria-live`/role states where status feedback matters;
- visible keyboard focus;
- color is not the only status cue;
- desktop keyboard navigation works without pointer;
- `prefers-reduced-motion` disables nonessential motion.

## Smart Entry / performance

- no artificial loading timers;
- Home/Create must not preload a heavy map SDK;
- Profile/System States may remain lazy;
- real providers will be loaded on demand;
- first Travel render shows user-owned data without waiting for external APIs.

## Legacy UI

Old Chat/Home/History CSS/components remain in repository for history and potential future reuse, but they are no longer the product source of truth. Do not polish or extend them inside Travel Pivot Foundation V1.
