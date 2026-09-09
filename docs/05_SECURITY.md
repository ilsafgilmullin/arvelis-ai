# ARVELIS AI — безопасность

**Актуальность:** Plan Real-Data Contract & AI Orchestration Policy V1, 2026-09-09.

## Auth / ownership invariants

- OTP verification выполняется trusted server-side;
- raw OTP не хранится и не логируется;
- OTP/session peppers находятся только в protected environment;
- session cookie HttpOnly;
- Account/Session server-authoritative;
- Trip `accountId` определяется из authenticated session;
- client `ownerScopeId` не является authorization credential;
- foreign Trip access fail closed.

## Trip persistence boundary

Server-side Trip API V1 account-scoped. SQLite используется для development/closed test, PostgreSQL adapter проверяется regression gate. Production DB/region/backups/retention остаются отдельным решением.

## Plan data minimization

Будущий AI/provider не получает raw Trip aggregate автоматически.

`PlanRequest` V1 содержит только planning data:

- Trip ID/revision;
- origin/destination;
- dates/duration;
- traveler count;
- budget limit;
- travel preferences;
- bounded optional prompt.

Не передаются автоматически:

- auth cookie/session secret;
- OTP/peppers;
- `ownerScopeId` как credential;
- traveler identity labels;
- passport/document data;
- bank/payment data;
- legal/map arrays;
- live location;
- provider/API credentials;
- database connection data.

## Provider response is untrusted input

Даже типизированный `AIProvider` не является trusted source.

Перед использованием `PlanProposal` проходит deterministic validation:

- contract version;
- Trip identity;
- bounded array/text sizes;
- unique IDs;
- source reference integrity;
- provenance values;
- claim category/confidence;
- destination/itinerary claim references;
- HTTPS URL validation.

Invalid provider response fail closed и не превращается в успешный Plan.

## Provenance / authoritative facts

Provenance V1:

- `user_input`;
- `provider_fact`;
- `model_inference`;
- `unknown`.

Критические external facts:

- transport schedule;
- price;
- availability;
- legal;
- weather.

Для них model inference не является authoritative независимо от confidence.

`provider_fact` обязан ссылаться на declared source. Legal provider fact требует official HTTPS source. Expired provider evidence не используется как authoritative.

User input подтверждает только то, что пользователь это сообщил; он не заменяет внешний authoritative source.

## Timeout / cancellation / failure policy

Server orchestration задаёт bounded timeout и принимает caller cancellation через `AbortSignal`.

Ошибки разделяются на:

- invalid input;
- access denied;
- provider not connected;
- cancellation;
- timeout;
- provider failure;
- invalid provider response;
- invalid configuration.

Нет silent fallback на mock result, local fake answer или альтернативного provider без явно реализованной policy.

## Audit minimization

Audit V1 хранит только технические metadata:

- request ID;
- Trip ID/revision;
- provider ID;
- timestamps/duration;
- orchestration status;
- validation error codes.

Audit V1 **не** хранит:

- user prompt;
- provider response body;
- documents;
- cookies/session secrets;
- API keys;
- raw model/tool traces.

Это снижает риск утечки чувствительного travel context через logs/audit.

## Prompt injection / tool boundary

В Plan V1 нет tool execution, RAG, browser/search tools или document retrieval. Поэтому provider output не может самостоятельно инициировать privileged server action.

До будущего tool/RAG layer обязательны отдельные решения по:

- prompt injection isolation;
- tool allowlists;
- per-tool authorization;
- data minimization;
- source provenance;
- output encoding;
- rate/cost controls;
- sensitive-document policy.

## Legal data

AI-generated legal conclusion не является authoritative source. При отсутствии official verified source юридический claim остаётся non-authoritative/unverified.

## Provider secrets

Все будущие AI/travel provider credentials должны находиться только server-side в protected environment. Frontend не получает vendor keys.

## CI security

- `npm audit --audit-level=high` обязателен;
- Nodemailer зафиксирован на `9.1.1` после security patch;
- GitHub Actions permissions: `contents: read`;
- self-mutating workflow отсутствует;
- Plan policy smoke проверяет ownership, source requirements, cancellation, timeout и invalid response.

## Production / Russia review

До public launch отдельно проверяются:

- требования к персональным данным и региону хранения;
- трансграничная передача данных будущим AI/travel providers;
- retention/deletion/export;
- consent/legal notices;
- доступность выбранной инфраструктуры в России без VPN, где это продуктово требуется.

ARVELIS нельзя называть production-ready до фактического security/privacy/infrastructure audit.
