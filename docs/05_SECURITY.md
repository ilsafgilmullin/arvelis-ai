# ARVELIS AI — безопасность

**Актуальность:** ARVELIS AI Engine & Knowledge Foundation V1 / бесплатная user-facing модель, 2026-09-09.

## Global invariants

- Account/Session and Trip ownership are server-authoritative;
- client `ownerScopeId` is not an authorization credential;
- OTP/session/provider/model secrets are server-side only;
- external provider, retriever, tool and model output is untrusted input;
- provider/model-specific credentials and IDs do not enter `Trip`;
- no provider response, model prompt, raw evidence payload, auth secret, document or payment data is logged by default;
- billing/subscriptions/paywall remain outside Travel Domain;
- no fake/model-generated external fact is promoted to authoritative data.

## Existing provider boundaries

Yandex Rasp remains closed without production activation or live key. Map V1 remains provider-neutral with no real map vendor/credentials. Legal V1 remains route-general and source-backed with no real Legal provider. Existing Transport/Map/Legal ownership, provenance, freshness and fail-closed rules stay in force.

## AI Gateway data minimization

`AiGatewayRequest` contains only:

- contract version;
- prompt;
- locale;
- `general | trip` scope.

The authenticated account scope remains in `AiGatewayServerContext` and is never exposed to `AiModelRuntime` input.

For trip-scoped execution the server must provide an already-authorized Trip ID. Missing/invalid trip authorization fails before model execution.

The model runtime must not receive cookies, session secrets, provider keys, account identifiers, raw user documents or unrestricted Trip persistence objects through this foundation boundary.

## Runtime/retrieval/tool isolation

The AI execution stack is split into independent server-side ports:

- `AiModelRuntime`;
- `KnowledgeRetriever`;
- `AiToolRegistry` handlers.

A real vendor adapter is not present in V1.

All external outputs are validated before use:

- retriever output validates source/chunk shape, IDs, references, HTTPS URLs and bounds;
- model turns validate request identity, tool calls and structured answers;
- tool output validates evidence shape and allowed domains;
- unknown/unregistered tools fail closed.

## Tool allowlist and provenance

Only the following V1 tool IDs exist:

- `trip.read`;
- `transport.search`;
- `map.route`;
- `legal.check`.

The model sees only tools with registered server handlers.

Tool evidence is stamped by the server with the actual executed `toolId`. A model cannot grant itself authority by inventing tool provenance inside its answer.

Server tool handlers receive the authenticated account/trip context; model-visible tool descriptors do not contain credentials or account scope.

## Protected factual domains

The following domains are protected:

- transport schedule;
- price;
- availability;
- map route;
- legal;
- weather.

A model inference is never authoritative for these domains.

Authority requirements:

- schedule/price/availability => current evidence from `transport.search`;
- map route => current evidence from `map.route`;
- legal => current official HTTPS evidence from `legal.check`;
- weather => authoritative status impossible in V1 because no Weather tool exists.

Stale or unknown-freshness evidence is not sufficient.

## Knowledge / RAG security boundary

Knowledge/RAG retrieval is untrusted and independently validated.

Knowledge sources may be `official`, `editorial` or `user`, but source type alone does not bypass protected-tool rules.

In particular:

- an official RAG chunk does not establish an authoritative Legal fact;
- RAG does not replace Transport, Map or Legal provider boundaries;
- missing `validUntil` produces freshness `unknown`;
- expired source evidence is non-authoritative;
- malformed/insecure source references fail closed.

No production source set, crawler, embedding model, vector store or ingestion service is configured in Foundation V1.

## Structured-output security

Final AI output contains a user-visible `message` plus typed `claims`.

Each claim declares:

- domain;
- `fact | inference` mode;
- evidence references.

Protected facts without the correct current tool evidence are rejected as invalid model output rather than silently downgraded to trusted content.

Important limitation: deterministic schema validation can verify declared claims/evidence, but cannot semantically prove that free-form prose contains no undeclared factual assertion. Therefore a future real-model activation requires semantic evaluation that all externally-checkable assertions are represented in structured claims.

## Bounded execution / denial-of-service controls

Foundation limits include:

- bounded prompt/output/evidence sizes;
- bounded retrieval source/chunk counts;
- allowlisted tool count;
- maximum two tool-call rounds;
- global Gateway timeout;
- caller cancellation;
- bounded audit metadata.

A timeout/abort propagates through runtime/retriever/tool execution via `AbortSignal`.

## Audit / observability

AI Gateway audit may contain only operational metadata such as:

- request ID;
- runtime/retriever ID;
- scope and authorized Trip ID;
- timing/status;
- retrieval status;
- tool-call count;
- evidence count;
- validation error codes.

Audit must not contain raw prompt text, raw evidence/source text, model credentials, provider secrets, cookies or user documents.

## Evaluation / activation policy

A future real AI runtime must not be activated solely because API connectivity works.

Mandatory evaluation coverage includes:

- account-scope isolation;
- trip authorization boundary;
- unknown tools;
- unsupported/stale price, schedule, availability, map, legal and weather facts;
- malformed retriever/tool/model output;
- protected-fact enforcement;
- server tool provenance stamping;
- timeout/cancellation;
- semantic structured-claim coverage for externally-checkable assertions.

The foundation release gate fails when required critical evaluation cases are missing or failed.

## Persistence / retention

Foundation V1 does not introduce model conversation persistence, vector storage, embedding storage or production Knowledge ingestion.

Any future retention requires a separate privacy/security/source-rights decision covering source terms, personal data, refresh, deletion and audit requirements.

## CI security

Important AI/Knowledge V1 gates:

- `npm audit --audit-level=high`;
- strict project typecheck;
- lower Plan/Transport/Map/Legal/Yandex/Trip regressions;
- one AI/Knowledge business/security/evidence gate;
- server runtime build including Gateway/Knowledge files;
- existing server-backed Chromium regression;
- frontend build;
- stacked PR PostgreSQL lower-layer regression;
- GitHub Actions `contents: read`.

## Production / STOP boundaries

No real model/runtime provider, embedding provider, vector database, AI credential or production Knowledge ingestion is connected in this foundation.

After the AI/Knowledge checkpoint, stop before selecting/activating those components. Production deployment, paid services, destructive migrations and merge to `main` remain forbidden without separate confirmation.
