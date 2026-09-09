# ARVELIS AI — безопасность

**Актуальность:** Server-side Trip Persistence & API V1, 2026-09-09.

## Auth invariants — сохраняются

Travel persistence не ослабляет существующую auth foundation:

- OTP verification выполняется trusted server-side;
- raw OTP не хранится и не логируется;
- OTP/session peppers независимы и находятся только в protected environment;
- session cookie HttpOnly;
- same-origin API boundary;
- Account/Session server-authoritative;
- SQLite используется только для development/closed test;
- PostgreSQL-compatible auth adapter сохраняется.

## Trip server ownership — реализовано

Server-side Trip API не доверяет client-supplied account identity.

- `accountId` определяется из authenticated HttpOnly session.
- `ownerScopeId` в Trip payload не выбирает owner и должен совпадать с session account.
- foreign-owned payload отклоняется.
- `GET /api/trips` возвращает только записи текущего account.
- `GET /api/trips/:id` не раскрывает Trip другого account.
- storage key — `(account_id, trip_id)`, поэтому одинаковый Trip ID разных аккаунтов не смешивает данные.
- `createdAt` / `updatedAt` нормализуются server-side.
- invalid/oversized Trip JSON fail closed.

Mutating Trip requests проходят существующий same-origin guard (`X-Arvelis-Request` + Origin/host/fetch-site checks). Это CSRF boundary текущего same-origin BFF runtime.

## Persistence / migrations

Migration `002_travel_trip_persistence` additive:

- создаёт новую account-scoped `travel_trips` table;
- использует foreign key на account;
- не удаляет и не преобразует существующие auth rows;
- не содержит destructive `DROP`;
- PostgreSQL migration checksum фиксируется в schema migration registry;
- SQLite schema также проверяет checksum migration.

Production DB choice/region/backups/restore/retention остаются `OPEN`; успешный SQLite/PostgreSQL compatibility test не означает production infrastructure approval.

## Data minimization

Trip aggregate может содержать travel preferences и плановые данные, но текущий slice не добавляет хранение:

- сканов паспортов;
- полных реквизитов документов;
- банковских данных;
- live location history;
- provider credentials;
- AI prompts/responses как отдельный persistent log.

Travel-document storage требует отдельной retention/privacy модели.

## Provider/security boundary

- AI/API keys никогда не передаются frontend.
- Реальные provider calls в будущем должны идти через trusted server adapters/gateway.
- Provider contracts должны поддерживать timeout, cancellation, rate/cost controls и минимизацию данных.
- Документы нельзя передавать AI/provider без утверждённой policy и явной цели обработки.
- Prompt injection/tool permission protections обязательны для будущего AI orchestration.
- AI-generated legal/price/availability statement без authoritative source не считается verified fact.

## Legal data

Legal requirement нельзя считать достоверным только потому, что его сгенерировала модель. При отсутствии проверенного source provider UI должен fail closed: «проверка не выполнена».

## Map/location

- точная live-геолокация не хранится по умолчанию;
- live tracking требует отдельного consent/retention решения;
- `MapPoint` не означает разрешение на background tracking.

## Logging

Разрешены минимальные технические metadata для диагностики. Без отдельной policy запрещено логировать:

- содержимое travel документов;
- OTP;
- session secrets;
- SMTP/API credentials;
- database credentials;
- полный чувствительный пользовательский input.

## Dependency security

В ходе persistence slice `npm audit --audit-level=high` выявил high-severity advisories в Nodemailer `9.0.5`. Dependency и npm lock обновлены до `9.1.1`; текущий CI audit показывает `0 vulnerabilities`.

CI после одноразового lock refresh возвращён к `permissions: contents: read`; self-mutating commit/push step удалён.

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
