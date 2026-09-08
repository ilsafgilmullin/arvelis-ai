# ARVELIS AI — безопасность

## Auth invariants — сохраняются

Travel pivot не ослабляет существующую auth foundation:

- OTP verification выполняется trusted server-side;
- raw OTP не хранится и не логируется;
- OTP/session peppers независимы и находятся только в protected environment;
- session cookie HttpOnly;
- same-origin API boundary;
- Account/Session server-authoritative;
- server-side authorization обязательна для будущих Travel API;
- SQLite используется только для development/closed test;
- PostgreSQL-compatible adapter сохраняется для дальнейшего persistence решения.

## Travel data ownership

- Trip data должна быть account-scoped.
- Клиентский `ownerScopeId` в будущей server API не считается доказательством владения: owner определяется из authenticated server session.
- Current local Travel repository namespaces data by account/local-preview scope и отклоняет foreign-owned payload; это frontend foundation, а не production authorization.
- Нельзя смешивать Trip data разных аккаунтов через общий local/server key.

## Data minimization

Собирать только данные, необходимые конкретному Trip-сценарию.

Не хранить без отдельного решения:

- сканы паспортов;
- полные реквизиты документов;
- банковские данные;
- лишние геолокационные истории;
- чувствительные travel документы в logs/analytics.

## Provider/security boundary

- AI/API keys никогда не передаются frontend.
- Все реальные provider calls в будущем идут через trusted server adapters/gateway.
- Provider contracts должны поддерживать timeout, cancellation, rate/cost controls и минимизацию передаваемых данных.
- Нельзя передавать документы в AI/provider без утверждённой policy и явной цели обработки.
- Prompt injection/tool permission protections обязательны для будущего AI orchestration.

## Legal data

Legal requirement нельзя считать достоверным только потому, что его сгенерировала модель.

Будущий Legal result должен хранить/показывать:

- country/requirement type;
- source name/url;
- verifiedAt;
- effectiveFrom/effectiveUntil;
- confidence/status;
- предупреждение об изменяемости правил.

При отсутствии проверенного source provider UI должен fail closed: «проверка не выполнена», а не генерировать заключение.

## Map/location

- Не хранить точную live-геолокацию по умолчанию.
- Live tracking требует отдельного consent/retention решения.
- Foundation MapPoint не означает разрешение на background tracking.

## Logging

Разрешены минимальные технические metadata для диагностики. Запрещено без отдельной policy логировать содержимое travel документов, OTP, session secrets, SMTP/API credentials и полный чувствительный пользовательский input.

## Secrets

`.env`, API keys, SMTP password, database credentials, peppers и production session secrets находятся только в protected environment. Они не попадают в repository, docs, screenshots или клиентский bundle.

## Russia / production review

До public launch отдельно по официальным источникам проверяются:

- требования к персональным данным и выбранным регионам хранения;
- трансграничная передача данных выбранным providers;
- retention/deletion/export;
- legal notices/consents;
- доступность production infrastructure в России без VPN, где это требуется продуктом.

ARVELIS нельзя называть production-ready до фактического security/privacy/infrastructure audit.
