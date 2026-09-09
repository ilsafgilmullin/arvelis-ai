# ARVELIS AI — дорожная карта

**Актуальность:** 2026-09-09.

Исторические universal/chat-first этапы сохраняются, но Travel Product Pivot остаётся текущим продуктовым направлением.

## Закрытые foundation layers

- [x] Travel Pivot Foundation V1;
- [x] Travel UI Redesign V2;
- [x] Server-side Trip Persistence & API V1 — Draft PR #28, green, not merged;
- [x] Plan Real-Data Contract & AI Orchestration Policy V1 — Draft PR #29, green, not merged.

## Transport Normalized Route Contract V1 — CURRENT RELEASE GATE

Branch: `feat/travel-transport-contract-v1`  
Base: Plan V1 / `7e99c1f118f037fcf90b488a1c2b24e409bedcf6`

- [x] minimized `TransportSearchRequest`;
- [x] explicit destination + exact-date V1 boundary;
- [x] typed normalized modes/segments/routes;
- [x] typed `TransportProvider` with request context + `AbortSignal`;
- [x] provider/request identity validation;
- [x] normalized amount in minor units + 3-letter currency;
- [x] explicit availability;
- [x] retrieval/validity freshness boundary;
- [x] route chronology validation;
- [x] server Transport orchestrator;
- [x] account ownership fail closed;
- [x] timeout/cancellation/not-connected/error semantics;
- [x] deterministic duration/transfer/price comparison;
- [x] no opaque/fake route score;
- [x] mixed currency comparison fail closed;
- [x] stale/unbounded data not authoritative;
- [x] Plan/Trip regressions;
- [x] implementation push typecheck/build/browser/frontend PASS;
- [ ] stacked Draft PR final regression gate;
- [ ] final PR checkpoint recorded.

Real transport provider, booking, FX provider и vendor keys не входят в contract slice.

## Следующая граница — PRODUCT/ENGINEERING DECISION REQUIRED

После зелёного Transport V1 contract следующий шаг внутри Transport roadmap — выбрать provider strategy.

До реализации adapter нужно отдельно решить:

1. какие виды транспорта обязательны для первого real-data release: авиа, железная дорога, автобус или комбинация;
2. какой источник/API доступен пользователям и backend из России без обязательного VPN;
3. API terms, стоимость, quotas/rate limits;
4. можно ли показывать цену/availability и на каких условиях freshness;
5. source/deeplink/booking policy;
6. разрешается ли только поиск или также redirect/affiliate/booking;
7. какие production credentials/secret handling нужны;
8. нужен один provider или fallback/routing между несколькими;
9. vendor lock-in и возможность замены;
10. legal/privacy/transborder implications.

До этого решения реальный adapter не подключается.

## Позже по roadmap

После утверждения Transport provider strategy:

1. real Transport adapter(s) + normalized route ingestion;
2. Budget provider inputs / Currency contract;
3. Legal source ingestion/verification;
4. Map provider implementation;
5. Stay/Weather integrations;
6. Trip Book export/generation;
7. Live Companion;
8. Safe/emergency capabilities.

## Всё ещё вне scope без отдельного решения

- real AI/RAG vendor;
- booking/ticket purchase;
- paid provider activation;
- production deployment/public registration;
- destructive Trip deletion/retention operations;
- production secrets;
- irreversible migrations;
- AR/offline maps;
- Live/Safe automation.
