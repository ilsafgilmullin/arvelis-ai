# ARVELIS AI — Chat Integration Audit v1

## Статус

Этот этап выполняется после Auth/Home/Profile/History foundation и **не является новым редизайном Chat v2**.

Базовая mobile viewport-shell геометрия, composer, search, sheets, rename/edit/delete и iPhone landscape rules не меняются без нового real-device evidence.

Цель этапа — проверить границы данных и честность preview перед будущим backend/auth/AI.

## Проверено без изменений

### Chat runtime

Подтверждено:

- новый чат остаётся пустым до первого сообщения;
- quick starts только подставляют локальный текст в composer;
- отправка сохраняет пользовательский текст локально;
- AI response не генерируется;
- system notice говорит, что AI не подключён;
- mock assistant отображается с `MOCK` и disclaimer;
- search исключает system messages;
- rename/delete/edit остаются локальными;
- thread/message limits отображаются явно;
- draft storage failure отображается пользователю;
- destructive delete confirm-first;
- attachment control в текущем Chat отсутствует — не изображается работающая загрузка файлов до утверждения data/backend contract.

### Scroll geometry

`scrollIntoView()` остаётся потенциальным кандидатом на future hardening, но в этом PR не меняется.

Причина: mobile viewport-shell уже проходил несколько real-device итераций, а нового видео/evidence конкретного document-scroll regression нет. Менять стабильную scroll geometry только теоретически запрещено текущим RC-подходом.

## Найденный data-boundary дефект

`arvelis.demo.workspace.v1` раньше проверял известные поля, но не запрещал дополнительные свойства.

Например, объект thread/message мог содержать неизвестный `providerToken`, `accessToken` или другое поле. TypeScript его не показывал, но исходный object оставался в workspace state и мог сериализоваться обратно.

Это тот же класс boundary-проблемы, который ранее был закрыт для Auth protocol objects.

## Exact-shape workspace boundary

Добавлены allowlists:

### Workspace

- `threads`;
- `activeThreadId`;
- `profileName`.

### Thread

- `id`;
- `title`;
- `createdAt`;
- `updatedAt`;
- `messages`.

### Message

- `id`;
- `role`;
- `content`;
- `createdAt`;
- optional `editedAt`;
- optional `mock`.

Unknown root/thread/message fields fail closed и не попадают в application workspace.

## Preview role semantics

Exact-shape недостаточно: локальный storage раньше мог подложить произвольный assistant/system text, который UI затем визуально воспринимал как ARVELIS AI/system status.

Теперь preview storage policy:

### user

- допускается обычное bounded user content;
- `mock` не допускается.

### system

Допускаются только:

- текущий `DEMO_PREVIEW_NOTICE`;
- известные legacy preview notices, которые мигрируются к текущему тексту.

Произвольный system status вроде `server connected` fail closed.

### assistant

Допускаются только:

- `mock: true`;
- либо известный legacy mock text без флага, который затем мигрируется к canonical `DEMO_MOCK_RESPONSE + mock:true`.

Произвольный non-mock assistant payload fail closed.

Это гарантирует: localStorage не может сделать preview визуально похожим на реально полученный AI response.

## Timestamp integrity

Добавлены безопасные invariant checks, не зависящие от текущих часов устройства:

- `thread.updatedAt >= thread.createdAt`;
- `message.createdAt >= thread.createdAt`;
- если `editedAt` присутствует, `editedAt >= message.createdAt`.

Не добавлен жёсткий `updatedAt >= latest message` и не введён `now + N` future cutoff.

Причина: текущий starter fixture имеет assistant message через 30 секунд после thread `updatedAt`; изменение этого контракта потребует отдельной migration/fixture decision. Скрытно менять исторические данные в integration PR не нужно.

## Cross-screen mock truthfulness

`conversationPreview()` используется Home и History.

Раньше mock assistant content мог отображаться там без метки `MOCK`, хотя внутри Chat он маркировался корректно.

Теперь preview формируется как:

`MOCK · <текст>`

и затем ограничивается тем же `maxLength`.

User content не получает этот prefix; system messages по-прежнему исключены.

## Regression coverage

Существующий `tests/demo-storage-profile-smoke.ts` расширен и остаётся частью `npm run test:auth`.

Проверяются:

- corrupt profile name не уничтожает healthy threads;
- unknown root field не сохраняется;
- unknown thread field не сохраняется;
- raw localStorage thread с unknown field не достигает workspace state;
- arbitrary non-mock assistant payload fail closed;
- arbitrary system status payload fail closed.

### Фактически выполнено

На доступной isolated среде:

- Node `22.16.0`;
- TypeScript `5.8.3`;
- `strict=true`;
- `noUncheckedIndexedAccess=true`;
- `exactOptionalPropertyTypes=true`.

Результат:

- isolated `demoStorage + previewProfile + storage regression` compile — PASS;
- runtime storage regression — PASS;
- conversationPreview mock-label behavior smoke — PASS.

Это не заменяет repository TypeScript `6.0.3` и настоящий `npm run check`.

## Что намеренно не добавлено

- attachments/upload;
- server message ids;
- AI streaming;
- retry/regenerate;
- model selector;
- citations;
- cloud sync;
- backend message persistence;
- token/cost UI;
- fake online AI state.

Эти функции требуют утверждённого MVP/data/provider/backend contract.

## Изменённые файлы

Относительно `feat/history-foundation-v1` integration scope должен содержать только:

- `src/lib/demoStorage.ts`;
- `src/domain/chatPresentation.ts`;
- `tests/demo-storage-profile-smoke.ts`;
- `docs/33_CHAT_INTEGRATION_AUDIT.md`.

ChatScreen/CSS geometry не меняются.

## Verification gate

Перед stacked PR:

- diff isolation = только integration/data boundary scope;
- `behind_by=0` относительно History base;
- PR mergeable;
- starter demo workspace проходит new role semantics;
- profile-only corruption recovery сохраняется;
- fake assistant/system payload fail closed;
- Home/History mock preview содержит `MOCK`;
- no new fake backend/AI capability.

Repository-level verification остаётся в issue #13:

- `npm run typecheck` на TS 6.0.3;
- `npm run test:auth` в реальном dependency environment;
- `npm run build`;
- настоящий `package-lock.json`.

## Merge policy

Стек:

`PR #11 Auth → PR #14 Home → PR #15 Profile → PR #16 History → Chat Integration PR`.

Не merge/retarget без последовательной проверки нижележащих PR и отдельного подтверждения пользователя.