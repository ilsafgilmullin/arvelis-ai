# ARVELIS AI

**ARVELIS AI — AI-first Travel Assistant** для русскоязычных самостоятельных путешественников.

Слоган: `INTELLIGENCE. PRECISION. RESULTS.`

Текущий пользовательский Travel UI — light AI-first. Геометрия ARVELIS brand mark не менялась.

## Product access model

ARVELIS AI на текущем этапе полностью бесплатен для пользователя. Billing/subscriptions/paywall не проектируются; provider quotas/cost controls остаются backend policy и не меняют `Trip`.

## Current engineering slice

`Legal Sources & Travel Legal Foundation V1` развивается в `feat/travel-legal-sources-foundation-v1` поверх закрытого `Map Provider Foundation & Route Map V1` (Draft PR #33).

Ни один real Legal provider, source ingestion service, credential или production legal endpoint не подключён.

## Legal architecture

`src/travel/legalContracts.ts` задаёт provider-neutral contracts:

- `LegalCheckRequest` — только Trip ID/revision, origin, destination и dates;
- scope V1 — только `route_general`;
- citizenship/passport/nationality в request не добавляются, потому что текущий `Trip` этих данных не содержит;
- `LegalSourceReference` хранит source provenance и optional effective dates;
- `LegalClaim` обязан ссылаться минимум на один source;
- `LegalCheckResponse` содержит provider/request identity, retrieval time, sources и claims.

`verified` claim допустим только при official HTTPS source. Secondary source может использоваться только как `needs_review`, но не как authoritative legal fact.

## Freshness / authority

Legal retrieval time не равен юридической актуальности.

- expired source => claim freshness `expired`, authoritative `false`;
- source без explicit `effectiveUntil` => freshness `unknown`, authoritative `false`;
- `current` + `verified` + official HTTPS sources => authoritative `true`.

Uncited conclusion или verified claim на secondary source отклоняются contract validation.

## Legal orchestration

`server/travel/legalOrchestrator.ts`:

- проверяет authenticated ownership до provider call;
- строит minimized route-general request;
- возвращает truthful `not_connected`, если provider отсутствует;
- поддерживает timeout/cancellation;
- валидирует untrusted provider output;
- не придумывает citizenship/passport facts;
- не мутирует `Trip` и не сохраняет provider result автоматически.

## Verification

```bash
npm ci
npm audit --audit-level=high
npm run typecheck
npm run test:legal-foundation
npm run test:transport-provider-foundation
npm run test:yandex-rasp-live
npm run test:trip-server
npm run build:auth-server
npm run test:travel-browser
npm run build
```

`test:legal-foundation` — один signal-bearing business/security/freshness gate. Он проверяет ownership-before-provider, route-general minimization, official-source authority, uncited/secondary-source fail-closed, freshness и cancellation.

## Boundaries

- no real Legal provider/credentials;
- no citizenship/passport assumptions;
- no uncited legal conclusions;
- no production deploy;
- no merge to `main`;
- no real AI/model/RAG provider yet.

После green Legal checkpoint следующий согласованный slice — `ARVELIS AI Engine & Knowledge Foundation V1`.

См. `docs/02_ARCHITECTURE.md`, `docs/03_ROADMAP.md`, `docs/05_SECURITY.md`, `docs/50_LEGAL_SOURCES_TRAVEL_LEGAL_FOUNDATION_V1.md`.
