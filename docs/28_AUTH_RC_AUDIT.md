# ARVELIS AI — Auth Foundation RC Audit (PR #11)

Дата: 2026-08-21.
Статус: `RELEASE-CANDIDATE FOUNDATION / DRAFT`, без production auth/backend/AI.

## Source of truth

- Repository: `ilsafgilmullin/arvelis-ai`.
- Stable base: `main` at `0850e51f823fe2054810fcb67b35d19d20bbcae2`.
- Candidate branch: `feat/auth-foundation-v1`.
- Pull request: Draft PR #11.
- На момент RC-аудита ветка не отстаёт от `main` (`behind_by=0`).
- PR mergeable.
- PR conversation/review comments отсутствуют.
- Replit Agent не использовался.

## Фактический runtime/tooling contract

`package.json`:

- Node engine: `>=22.12.0 <27`;
- React `19.2.8`;
- React DOM `19.2.8`;
- TypeScript `6.0.3`;
- Vite `8.2.1`;
- `npm run typecheck`;
- `npm run test:auth`;
- `npm run build`;
- `npm run check = typecheck → auth smoke → build`.

Replit:

- module `nodejs-22`;
- port `3000`;
- запускает `npm install --include=dev --no-package-lock --no-audit --no-fund && npm run dev`.

Реального dependency lockfile в репозитории по-прежнему нет.

## Scope PR #11

### App experience

- branded preboot до JavaScript;
- Splash;
- `Вход / Регистрация` frontend preview;
- Smart Entry;
- post-entry destination = новый пустой Chat;
- Home как product/info hub;
- Profile/user-facing copy;
- preview logout без удаления локальной истории;
- iPhone/PWA metadata и Apple touch icon.

### Auth Core foundation

- provider-independent `AuthGateway`;
- untrusted `AuthTransport` boundary;
- runtime guards;
- Unicode protocol-text safety boundary;
- deterministic auth reducer/state machine;
- async controller со stale-response protection;
- code challenge lifecycle;
- external OAuth/OIDC redirect boundary;
- server-session/device list contracts;
- Account Security UI foundation;
- safe auth error presentation;
- local preview profile/storage integrity boundary;
- negative QA/threat model/API/data model/provider research.

## P0/P1/P2 findings исправлены в ходе RC-аудита

### 1. Sign-up intent терялся после ошибки

До исправления общий `error/rate/offline → RESET` мог вернуть пользователя из неудачной регистрации в `sign_in`.

Исправлено:

- `offline`, `rate_limited` и `error` сохраняют исходный `AuthIntent`;
- Retry/Reset возвращает в исходный `sign_up` или `sign_in`.

### 2. Локальное UI-событие могло забыть live server session

`SET_INTENT` и browser offline state не должны превращать authenticated user в signed-out только из-за клиентского UI-state.

Исправлено:

- authenticated/signing-out/sign-out-error state сохраняется при `SET_INTENT`;
- offline event сам по себе не разлогинивает live session;
- controller не начинает новый `sign_in/sign_up` поверх live session;
- `setIntent()` не инвалидирует pending auth sequence, когда session уже жива.

### 3. Failed logout мог выдавать ложное состояние

Исправлено:

- `signing_out` хранит live session;
- `sign_out_error` сохраняет session при server failure;
- session list не маскируется как empty;
- UI прямо сообщает, что сессия всё ещё считается активной;
- если `AuthGateway` недоступен, logout **не** считается успешным: server revoke не подтверждён.

### 4. Recoverable code error уничтожала challenge

Исправлено:

- invalid/recoverable code/network/service error возвращает пользователя в тот же active code challenge;
- stale/mismatched `challengeId` не отправляется в transport и не уничтожает текущий валидный code challenge;
- отсутствие gateway во время code completion сохраняет challenge с безопасной service-unavailable ошибкой;
- expired/locked/denied state остаётся отдельным failure path.

### 5. OAuth и first-party code completion были слишком универсальны

Исправлено:

- `complete()` — только first-party `code` challenge;
- `external_redirect` ведёт на HTTPS authorization URL;
- попытка вызвать first-party `complete()` для active external flow не разрушает redirect state;
- provider callback завершается ARVELIS backend/BFF;
- frontend после возврата делает `restoreSession()`;
- provider authorization code/token не становится обычным React state.

### 6. Outgoing auth payload имел только length checks

Исправлено:

- method/session/challenge ids блокируются при unsafe control/format characters;
- present identifier не может быть blank после trim;
- identifier/code response проверяются до transport;
- malformed payload не доходит до transport.

### 7. Server session/account metadata была недостаточно строгой

Исправлено:

- server display name должен быть non-empty;
- email/phone, если присутствуют, должны быть non-empty;
- `expiresAt > createdAt`;
- `lastSeenAt` должен находиться внутри session window;
- device/browser labels, если присутствуют, должны быть non-empty;
- unsafe control/format characters блокируются.

### 8. Runtime JSON нельзя считать доверенным TypeScript-типом

Исправлено ранее в текущем PR:

`AuthTransport (unknown) → runtime guards → guarded AuthGateway → controller/UI`.

Fail closed для malformed account/session/challenge/failure/method payload.

### 9. Повторный restore мог разрушить уже подтверждённую session при transport failure

Исправлено:

- если session уже жива, `restore()` не переводит UI обратно в `checking_session`;
- trusted `session=null` от backend остаётся авторитетным sign-out;
- network/transport failure при revalidation сохраняет существующую live session;
- method catalog refresh остаётся независимым;
- `restore()` не стартует во время `signing_out`, чтобы не гоняться с server logout.

### 10. Controller callbacks могли работать со stale render-state

Исправлено:

- актуальный auth state зеркалируется через `stateRef`;
- start/setIntent/signOut/revoke/complete используют текущий lifecycle state для security gating;
- code completion не зависит от stale React closure для проверки активного challenge.

### 11. Legacy localStorage profile обходил новую auth-domain validation

До исправления новый Registration/Profile валидировал имя через `previewProfile`, но старый `demoStorage` принимал `profileName` только по `trim/length`. Дополнительно control-character check выполнялся после whitespace normalization, поэтому `\n`/`\t` могли быть преобразованы в пробел раньше reject-проверки.

Исправлено:

- unsafe control/format characters проверяются до whitespace normalization;
- `DEFAULT_PREVIEW_PROFILE_NAME` вынесен в один source of truth;
- `resolveStoredPreviewProfileName()` обрабатывает untrusted/legacy storage value;
- повреждённое имя сбрасывается к системному default, но здоровые threads не удаляются;
- persistence принимает только canonical пользовательское имя либо internal default reset-state;
- App/Auth/Home больше не сравнивают системное имя через локальные дубли строк;
- `AuthScreen` guard-ит existing-profile prop до отображения найденного локального профиля.

### 12. Unicode protocol-text spoofing и trim-bypass

До исправления auth protocol boundary блокировал в основном ASCII C0/DEL. Unicode format controls — например zero-width и bidi override — могли пройти в server-provided labels/display name или outgoing protocol value. Кроме того, outgoing gateway сначала делал `.trim()`, поэтому leading/trailing `\n`/`\t` могли исчезнуть до control-character check.

Исправлено:

- добавлен единый `src/auth/protocolText.ts`;
- incoming runtime guards и outgoing guarded gateway используют один Unicode safety primitive;
- блокируется Unicode general category `C*`, включая control/format characters, bidi overrides и zero-width format controls;
- raw `methodId`, `identifier`, `challengeId`, code response и revoke `sessionId` проверяются **до** trim/normalization;
- server method label/account display name/device/browser label также fail closed при unsafe format/control text;
- обычный Unicode-текст без unsafe control/format characters не блокируется;
- preview-profile validation использует тот же primitive, не дублируя regex policy.

Exact timestamp RFC3339/ISO serialization намеренно **не** ужесточалась: текущий server API contract не фиксирует окончательный timestamp wire-format, поэтому такой формат не выдаётся за утверждённое решение.

## Фактические проверки

### Выполнено

1. Source-level audit:
   - `App → Auth → Smart Entry → Chat`;
   - Profile/logout;
   - Auth Core contracts/reducer/controller;
   - runtime guards/gateway;
   - Unicode protocol-text boundary;
   - OAuth external boundary;
   - Account Security states;
   - local preview profile/storage boundary;
   - QA state fixtures;
   - CI/Replit/package configuration.

2. iPhone video QA ранее фактически выполнен для app-entry/auth foundation до последних contract-only hardening изменений. Найденные first-paint/auth-copy/Profile проблемы исправлены.

3. Isolated pure Auth Core TypeScript smoke:
   - Node `22.16.0`;
   - TypeScript `5.8.3`;
   - `strict`;
   - `noUncheckedIndexedAccess`;
   - `exactOptionalPropertyTypes`;
   - результат: PASS.

4. Reducer edge behavioral smoke:
   - sign-up intent preservation: PASS;
   - Retry intent preservation: PASS;
   - live session survives `SET_INTENT`: PASS;
   - live session survives offline event: PASS.

5. JSX/union compile smoke для AuthStatusPanel/StatesScreen после discriminated-state изменений: PASS в isolated typed-stub environment.

6. `npm run test:auth` включён в `npm run check` и CI. Текущий smoke-suite содержит:
   - `tests/auth-core-smoke.ts`;
   - `tests/preview-profile-smoke.ts`;
   - `tests/demo-storage-profile-smoke.ts`;
   - `tests/protocol-text-smoke.ts`.

7. После restore/challenge race-hardening отдельно повторён isolated controller strict compile-smoke:
   - Node `22.16.0`;
   - TypeScript `5.8.3`;
   - `strict + noUncheckedIndexedAccess + exactOptionalPropertyTypes`;
   - typed React hook stubs;
   - результат: PASS.

8. Preview-profile policy regression smoke фактически выполнен локально:
   - blank/control/tab/format/reserved/oversized cases;
   - canonical whitespace normalization;
   - stored-value fail-closed resolver;
   - canonical persistence contract;
   - результат: PASS.

9. Local storage profile-boundary smoke фактически выполнен локально:
   - валидная запись workspace;
   - инъекция corrupt legacy `profileName`;
   - recovery к system default;
   - healthy threads сохраняются;
   - corrupt/non-canonical persistence отклоняется;
   - internal default reset-state сохраняется;
   - результат: PASS.

10. Unicode/raw protocol-text smoke фактически выполнен локально после raw-before-trim hardening:
    - normal Cyrillic/Unicode text: PASS;
    - U+200B zero-width control: rejected;
    - U+202E bidi override: rejected;
    - ASCII NUL: rejected;
    - server method/account text с format controls: rejected;
    - leading/trailing newline/tab в start/complete/revoke request: rejected **до transport**;
    - transport call counters для rejected cases: `0`;
    - Node `22.16.0` / TypeScript `5.8.3` strict compile + behavior: PASS.

11. После перевода `previewProfile` на общий `protocolText` helper отдельно повторён shared profile strict smoke: PASS.

### Не заявляется как выполненное

- repository TypeScript `6.0.3` `npm run typecheck`;
- repository `npm run test:auth` в настоящем dependency environment;
- Vite `npm run build`;
- Android runtime QA;
- desktop runtime QA;
- повторный iPhone runtime smoke после последних contract/state-machine/data-boundary изменений.

## CI gate

Последние проверенные GitHub Actions runs текущего RC-прохода создают job `validate`, но GitHub возвращает:

- conclusion: failure;
- `steps=null`;
- `logs_url=null`.

То есть Checkout / Setup Node / Install / Typecheck / Auth smoke / Build фактически не стартуют.

Workflow YAML по видимой конфигурации обычный и содержит все необходимые steps. Менять его вслепую без runner-level evidence не следует.

## Lockfile gate

`package-lock.json` отсутствует.

В ходе RC-аудита повторно проверена возможность получить npm registry из изолированной среды — запрос завершился timeout, npm cache нужных зависимостей отсутствует. Поэтому lockfile не генерировался вручную и не фабриковался.

До production foundation необходимо:

1. сгенерировать настоящий lockfile из доступного npm environment;
2. проверить его;
3. перейти в CI на `npm ci`;
4. убрать Replit `--no-package-lock` после подтверждения воспроизводимой установки.

## Security hygiene

В PR не добавлены:

- API keys;
- provider client secrets;
- passwords;
- session secrets;
- bearer credentials;
- database credentials;
- frontend-authoritative owner/admin roles.

Production session candidate остаётся server-authoritative; frontend не строится вокруг long-lived auth token в localStorage.

ARVELIS CONTROL остаётся отдельной owner/admin security boundary в PR #12.

## Известные OPEN decisions — не считать утверждёнными

- email / phone / combination как primary identifier;
- password / OTP / magic-link / WebAuthn;
- конкретный identity core;
- Yandex/VK/Apple/Google composition первого релиза;
- backend framework;
- production DB;
- hosting/data region;
- cookie/CSRF topology;
- recovery/account-linking policy;
- роли/permissions;
- exact timestamp wire-format;
- exact retention/legal data-flow map.

## RC decision

По source/security/contract состоянию подтверждённых P0/P1 Auth Core/local-profile blockers после текущего аудита не осталось.

PR #11 **не готов к автоматическому merge только по этому документу**, потому что остаются внешние/фактические gates:

1. настоящий project `typecheck/test:auth/build`;
2. dependency lockfile;
3. короткий runtime smoke финального app-entry/auth UI.

PR остаётся Draft. `main` не изменять без отдельного подтверждения пользователя.
