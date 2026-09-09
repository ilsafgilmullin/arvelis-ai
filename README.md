# ARVELIS AI

**ARVELIS AI — AI-first Travel Assistant** для русскоязычных самостоятельных путешественников.

Слоган: `INTELLIGENCE. PRECISION. RESULTS.`

Текущий пользовательский Travel UI — light AI-first. Геометрия ARVELIS brand mark не менялась.

## Product access model

На текущем этапе ARVELIS AI полностью бесплатен для пользователя.

- billing/subscriptions/paywall не проектируются;
- Travel Domain не содержит monetization fields;
- provider quotas/cost controls остаются внутренней backend policy;
- будущая смена коммерческой модели не должна требовать изменения `Trip`.

## Current engineering slice

`Transport Provider Strategy & Adapter Foundation V1` развивается в stacked-ветке `feat/travel-transport-provider-foundation-v1` поверх закрытого `Transport Normalized Route Contract V1` (Draft PR #30).

Foundation определяет provider activation policy **до live API activation**.

## Provider strategy

### Yandex Rasp

Primary schedule candidate.

Foundation уже содержит provider-specific adapter boundary с injected client/location resolver, но **не содержит live API key и не активирует реальный HTTP traffic**.

Current policy snapshot требует:

- совместимость с бесплатным публичным продуктом;
- явную attribution;
- temporary-cache-only handling;
- server-side credentials;
- отдельное подтверждение quota;
- повторную official terms review непосредственно перед activation.

`et_marker` не считается availability. Provider validity не выдумывается. Yandex prices нормализуются с explicit price semantics.

### Aviasales

- Search API сейчас не подключается;
- Data API оставлен только как future cached price-insight source;
- ни один Aviasales adapter/API key не активирован.

## Transport architecture

Provider-independent `TransportSearchRequest/TransportSearchResponse` сохраняются как canonical boundary.

Route теперь имеет `legId`; price имеет semantics `from/quoted/cached_observation/unknown`. Provider-specific restrictions не записываются в `Trip`.

`TransportOrchestrator` по-прежнему отвечает за ownership, timeout/cancellation, normalized validation и truthful `not_connected`; booking/payment и automatic Trip mutation отсутствуют.

## Verification

```bash
npm ci
npm audit --audit-level=high
npm run typecheck
npm run test:plan-policy
npm run test:transport-policy
npm run test:transport-provider-foundation
npm run test:trip-server
npm run build:auth-server
npm run test:travel-browser
npm run build
```

Stacked PR дополнительно прогоняет PostgreSQL 18.4 lower-layer regression.

## Next agreed slice

После зелёного Provider Foundation DoD — `Yandex Rasp Live Adapter V1` без production activation:

- real server-side HTTP client;
- env-only API key;
- location resolution;
- mapping/attribution/provenance;
- temporary cache;
- one stubbed server-side HTTP happy-path;
- no booking/payment/persistent Yandex result storage.

Фактическая activation live key остаётся отдельным действием после повторной проверки official terms/quota и наличия credentials.

## Release boundaries

- no merge to `main` without explicit confirmation;
- no production deploy;
- no paid services;
- no provider keys in Git/PR/logs/docs;
- no destructive migrations/deletion.

См. `docs/01_PRODUCT.md`, `docs/02_ARCHITECTURE.md`, `docs/03_ROADMAP.md`, `docs/05_SECURITY.md`, `docs/46_TRANSPORT_NORMALIZED_CONTRACT_V1.md`, `docs/47_TRANSPORT_PROVIDER_STRATEGY_ADAPTER_FOUNDATION_V1.md`.
