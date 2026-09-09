# ARVELIS AI — зафиксированные решения

## 2026-08-20 — Brand

- Название: `ARVELIS AI`.
- Слоган: `INTELLIGENCE. PRECISION. RESULTS.`
- Базовая визуальная система: премиальный графитово-золотой интерфейс с утверждённой геометрией знака.
- Логотип: геометрическая золотая `A` внутри круговой орбиты с точечной правой дугой.
- Полная композиция: знак, `ARVELIS`, ниже `AI` между тонкими линиями, затем слоган.
- Форма логотипа, композиция, название и слоган не меняются без отдельного подтверждения.

## 2026-08-20 — Product

- Официальное позиционирование: `ARVELIS AI — профессиональный универсальный ИИ-ассистент для работы, учёбы и решения сложных повседневных задач.`
- Продукт создаётся для широкой аудитории.
- Первый AI MVP не должен автоматически пытаться одинаково глубоко закрыть все категории; главная проблема первого AI-релиза ещё не выбрана.

## 2026-08-20 — UX character

- Интерфейс не должен быть холодным или чрезмерно строгим.
- Целевой характер: `живой + дружелюбный + профессиональный + премиальный`.
- Дружелюбность не означает инфантильность, яркие кислотные эффекты, игровой HUD или визуальный шум.
- Пользовательский вход должен ощущаться как вход в `ARVELIS AI`, а не в техническое `рабочее пространство`.
- При наличии отображаемого имени ARVELIS AI приветствует пользователя по имени.
- Основной CTA: `Открыть ARVELIS AI`.

## 2026-08-20 — Smart Entry

- Loading при входе не должен быть фальшивым таймером.
- Progress строится только по фактически завершённым задачам подготовки.
- Критическое ядро предварительно загружает App Layout, стартовый экран, Chat и локальное preview-state.
- После готовности core используется напрямую, без второго full-screen loader.
- Второстепенные экраны прогреваются после входа в background/idle режиме, чтобы снизить пиковую нагрузку на телефон.
- На коротких экранах и в landscape loading-композиция адаптируется без изменения утверждённой геометрии логотипа.
- Зависшая критическая загрузка должна переходить в retry-state, а не висеть бесконечно.

## 2026-08-20 — Chat experience

- Chat использует современную conversational interaction-модель, но не копирует визуальную систему ChatGPT или другого продукта.
- Пользовательское сообщение отображается как компактная правая bubble; assistant/mock — отдельная ARVELIS AI зона; system preview — компактное notice.
- Реальные frontend/local действия: новый диалог, переименование, удаление с подтверждением, копирование, редактирование пользовательского сообщения, локальные drafts, smart scroll, поиск по текущему диалогу и быстрые заготовки.
- Черновики хранятся отдельно от основного workspace state, чтобы ввод каждого символа не сериализовал всю историю диалогов.
- Новый диалог использует общий draft между Home и пустым Chat: переход между этими экранами не должен терять введённый текст.
- Быстрые сценарии/заготовки только заполняют composer и не отправляют сообщение автоматически.
- На touch/iPhone Return остаётся новой строкой; отправка выполняется кнопкой. На desktop Enter отправляет, Shift+Enter добавляет строку.
- Автоскролл не должен принудительно уводить пользователя вниз, если он читает старую часть истории; в таком случае показывается компактная 44px icon-only кнопка перехода к последнему сообщению.
- Поиск по текущему диалогу работает локально по тексту сообщений, без HTML injection; переход между совпадениями прокручивает к целому сообщению.
- Датированные разделители `Сегодня/Вчера` и per-message clock timestamps скрыты в Chat v2 как лишний messenger-like шум; относительное время остаётся в History.
- Пользовательские Chat-ограничения централизованы в `src/domain/chatPolicy.ts`, а не размножаются по UI-компонентам.
- Preview-лимиты threads/messages показываются явно и не являются тарифными или production-ограничениями.
- PREVIEW-маркировка должна оставаться честной и заметной, но не дублироваться в каждой служебной строке. Предпочтение: один стабильный `PREVIEW` indicator и контекстные объяснения только там, где пользователь принимает решение или ожидает AI-ответ.
- Реалистичный демонстрационный ответ допустим только как явно помеченный `MOCK` с прямым пояснением, что это предзаписанный текст, а не результат модели.
- На mobile Search, Rename и Edit считаются отдельными interaction modes: нижняя навигация и основной composer не должны конкурировать с клавиатурой и активной формой.
- На mobile Chat использует отдельный bounded viewport-shell: document/root scroll блокируется, прокручивается только message stream, а shell синхронизируется с полным `window.visualViewport` (`top/left/width/height`).
- Touch-landscape с малой высотой остаётся в mobile Chat contract независимо от CSS-width устройства; breakpoint не должен отключать mobile shell после поворота iPhone.
- В очень низком landscape viewport при software keyboard header может временно скрываться, чтобы composer и send-control гарантированно оставались доступными.
- При выходе из Chat обычный document scroll Home/History/Profile полностью восстанавливается.
- На узком iPhone header сохраняет знак ARVELIS, но может скрывать повторяющий compact wordmark, чтобы не создавать collision с действиями Chat.
- `+` внутри composer не показывается до появления реального attachment/action menu. Кнопка не должна обещать несуществующую функцию.
- `Regenerate`, `Stop generation`, upload, voice, web-search, citations и model selector не показываются как доступные до реальной provider/backend реализации и отдельного продуктового решения.

## 2026-08-20 — Current scope

- Сначала product foundation, бренд-ассеты и рабочий интерфейс.
- Реальный AI подключается только после закрытия обязательных gate из `docs/06_MVP_GATES.md`.
- Внешние интеграции не входят в текущий этап.
- Preview/mock элементы всегда маркируются как `PREVIEW/MOCK` и не выдаются за AI/backend.

## 2026-08-20 — Preview technical stack

Для runnable frontend-preview зафиксирован текущий стек:

- React 19.2.8;
- React DOM 19.2.8;
- TypeScript 6.0.3;
- Vite 8.2.1;
- Node.js 22.12+;
- Replit runtime без Replit Agent;
- локальное состояние через browser `localStorage`.

Это **не утверждает production technical stack**, backend, auth, database или AI provider.

## 2026-08-20 — Git workflow

- Источник истины: GitHub.
- `main` — стабильная ветка.
- Разработка: отдельные рабочие ветки.
- Merge в `main`, force push, удаление веток и production deploy — только после отдельного подтверждения.
- Replit Agent не используется для обычной разработки; обновление тестового Replit идёт через GitHub Pull.

## 2026-08-21 — Preview QA / PR №10 merge decision

- PR №9 (`feat: build ARVELIS AI conversational chat experience`) уже слит в `main`; после фактического iPhone запуска были выявлены существенные mobile Chat UX/runtime проблемы.
- Для `feat/chat-refactor-v2` / PR №10 выполнены четыре фактических iPhone video-smoke прохода без Replit Agent. Подтверждены отправка, drafts, History/thread transitions, action/rename sheets, portrait message-scroll containment и rotation без падения приложения.
- Safari edge-case из последнего видео привёл к переходу на bounded `visualViewport` Chat shell и единому mobile contract для portrait/touch-landscape.
- Финальный pre-merge аудит всего frontend-preview зафиксирован в `docs/14_PRE_MERGE_AUDIT.md`.
- Во время финального аудита удалён оставшийся legacy viewport-listener, который принудительно вызывал `scrollIntoView()` и мог конфликтовать с новой Safari layout-моделью; `IntersectionObserver` привязан к внутреннему message stream.
- Также исправлен reset preview-данных: старое состояние удаляется, чистое состояние сохраняется отдельно, а UI получает фактический результат persistence.
- Незакрытых PR review-thread/review замечаний на PR №10 нет.
- GitHub Actions остаётся инфраструктурно неисправным: job завершается до первого step (`steps=null`), поэтому project TypeScript 6.0.3 `typecheck/build` нельзя считать выполненным.
- В репозитории пока отсутствует dependency lockfile. Это зафиксированный инфраструктурный долг; lockfile нельзя подменять вручную без реального npm resolution.
- Пользователь отдельно разрешил merge PR №10 после полного аудита и исправления критических ошибок. Это разрешение относится к private frontend-preview и **не является production release approval**.
- После merge дальнейшая работа без подключения AI начинается с нового clean branch и идёт от авторизации/onboarding к Главной, Профилю и остальным product screens.

## 2026-08-21 — App entry / authorization UX

Утверждён пользовательский поток приложения:

`ARVELIS Splash → Вход / Регистрация → Smart Entry → Новый чат`.

- После успешного входного шага пользователь открывает новый пустой Chat, а не Главную.
- Основная пользовательская навигация остаётся `Главная · Чат · История · Профиль`.
- `Главная` — product/info hub, а не второй Chat composer.
- Первый paint должен быть брендированным до загрузки JavaScript; пустой чёрный экран после refresh не является допустимым app experience.
- В текущем frontend-preview вход/регистрация не выдаются за production account: email/password/OTP/social provider не имитируются как работающие.
- Реальный auth должен оставаться provider-independent и server-authoritative.

## 2026-08-21 — Первый production auth method

Утверждён первый базовый способ регистрации и входа пользователя:

**email + одноразовый код, без постоянного пароля (passwordless OTP).**

- Email является первым базовым identifier для auth-flow.
- Постоянный пароль не требуется в первом auth release.
- OTP является short-lived, single-use и проверяется только trusted server-side.
- Raw OTP не хранится и не логируется; server challenge хранит только защищённый verifier/HMAC.
- `start` не должен раскрывать, существует ли аккаунт для конкретного email.
- ARVELIS Account ID и server session остаются собственными и не зависят от email provider.
- Yandex ID / VK ID / Apple / Google могут быть добавлены позже как заменяемые external identity adapters, но не являются обязательной базой первого входа.
- ARVELIS CONTROL не использует пользовательский email OTP realm как достаточную owner/admin authorization boundary.
- Server foundation зафиксирован в `docs/34_EMAIL_OTP_AUTH_CORE.md`.

Остаются `OPEN`: production DB provider/region, окончательная backend topology, account linking/recovery, роли и уровни доступа, production session/cookie policy.

## 2026-08-21 — Бесплатная отправка email OTP для test/auth

Предыдущее решение использовать **Yandex Cloud Postbox отменено пользователем до активации инфраструктуры**.

- Postbox resource, billing account, sender/domain и API credentials не создавались.
- Для закрытого тестирования утверждён бесплатный path: обычный бесплатный ящик **Яндекс Почты** через generic SMTP adapter.
- Отдельный Yandex Cloud billing account, платный email-сервис и собственный домен для test/auth не требуются.
- Основной SMTP test endpoint: `smtp.yandex.ru`, port `465`, SSL/SMTPS.
- Для ARVELIS используется отдельный тестовый mailbox и отдельный пароль приложения типа «Почта»; обычный пароль Яндекс ID не хранится в ARVELIS.
- SMTP credentials хранятся только в protected environment/secrets.
- SMTP-транспорт ARVELIS требует TLS `1.2+`.
- Account, Session и frontend по-прежнему не зависят от Яндекса: email delivery остаётся за `EmailOtpDeliveryPort` / generic SMTP adapter.
- Обычная Яндекс Почта утверждена только для development/closed testing. Production transactional-email provider остаётся `OPEN`.

## 2026-08-21 — Бесплатная БД для закрытого auth-теста

Для текущего development/closed-test этапа выбран **SQLite через встроенный `node:sqlite`**.

- Базовый test runtime: `AUTH_DB_PROVIDER=sqlite`.
- Файл по умолчанию: `.data/arvelis-auth.sqlite`.
- Внешний DB account, отдельный cloud database и платный DB-сервис для закрытого теста не требуются.
- SQLite adapter реализует те же Account / Email Identity / OTP Challenge / Rate Limit / Session contracts, что и PostgreSQL adapter.
- PostgreSQL adapter не удаляется и остаётся заменяемым вариантом для будущего production persistence.
- SQLite-файл и WAL/SHM исключены из Git и не должны попадать в GitHub, чат или публичные артефакты.
- Это решение относится только к development/closed testing. Локальный filesystem опубликованного Replit deployment не считается production-persistent storage.
- Production DB provider/region, backups, retention, migration path и требования по персональным данным остаются `OPEN`.

Основание: пользователь потребовал убрать обязательные платные сервисы на текущем тестовом этапе; SQLite позволяет проверить реальную регистрацию и server session без внешней БД, сохраняя provider-independent persistence boundary.

Следствие: до production ARVELIS обязан перейти на отдельно утверждённое persistent storage решение; текущий SQLite-файл нельзя выдавать за production DB.

## 2026-08-21 — ARVELIS CONTROL

Утверждено направление отдельного административного продукта `ARVELIS CONTROL` для владельца/будущих администраторов.

- CONTROL — отдельный control-plane, а не пункт пользовательской нижней навигации ARVELIS AI.
- Он должен использовать отдельную owner/admin authentication/authorization boundary и не делить пользовательскую session как достаточное административное право.
- Назначение: operational overview, проблемы, поддержка, процессы, события/audit и административные настройки по мере появления реального backend.
- Fake users/tickets/incidents/live metrics недопустимы.
- Реальные owner/admin роли, способ входа, support provider, billing/admin actions, production infrastructure controls и exact domain остаются `OPEN`.
- Frontend foundation развивается отдельно в `feat/arvelis-control-v1` / Draft PR №12 и не должен смешиваться с пользовательским App bundle.

## 2026-09-08 — Travel Product Pivot

Это решение **supersedes** продуктовые части решений `2026-08-20 — Product` и `2026-08-21 — App entry / authorization UX`, где ARVELIS позиционировался как универсальный assistant и Chat был центральным стартовым контуром. Исторический текст выше сохраняется намеренно. Brand, Email OTP, Account/Session, security и Git workflow этим pivot не отменяются.

### Vertical

- `ARVELIS AI — AI Travel Assistant` полного цикла.
- Название, слоган, знак, graphite/gold brand direction остаются без изменений.

### Target user

- русскоязычный самостоятельный путешественник;
- solo, пары, семьи, небольшие группы;
- Россия + международные поездки;
- бюджетные ограничения считаются основным входным параметром;
- приоритет iPhone, Android, desktop;
- проектировать для работы в России без VPN там, где это технически и юридически возможно.

### Main problem

Пользователь вынужден отдельно решать направление, транспорт, время, бюджет, комфорт, legal requirements, карту и itinerary. ARVELIS должен собирать эти ограничения в один проверяемый `Trip`, отделяя real provider/source data от предположений.

### Main flow

`Главная → Создать поездку / Мои поездки → Trip Workspace → Plan/Transport/Budget/Legal/Map/Itinerary → Trip Book`.

Основной объект продукта — `Trip`. Chat может появиться позже внутри конкретного Trip как interaction layer, но не является корнем архитектуры.

### MVP product boundaries

- **Plan** — параметры, направление/Discover и планирование;
- **Transport** — normalized routes/segments;
- **Budget** — лимит, расходы, резерв, остаток;
- **Legal** — requirements только с source/date/status boundary;
- **Map** — provider-neutral map layer;
- **Itinerary** — программа по дням;
- **Trip Book** — единый пакет поездки.

`Live Companion` и `Safe` фиксируются как future направления и не входят в текущий Foundation V1.

### Travel Pivot Foundation V1

- real AI provider не подключается;
- real flight/rail/bus/stay booking APIs не подключаются;
- paid map API не подключается;
- production Legal/Weather API не подключаются;
- payment/billing/subscriptions/production deploy не выполняются;
- user-created Trip drafts допускается хранить локально как account/local-preview scoped foundation data;
- sample/mock content отделяется от user-created data;
- фальшивые рейсы, цены, гостиницы, legal conclusions, карты и AI recommendations запрещены;
- provider contracts закладываются для `AIProvider`, `TransportProvider`, `MapProvider`, `LegalSourceProvider`, `WeatherProvider`, `StayProvider`, `CurrencyProvider`;
- existing Email OTP/Auth foundation сохраняется без ослабления.

### Consequences

- Home больше не строится вокруг универсального Chat.
- Primary navigation: `Главная · Поездки · Создать · Профиль`.
- Старые Chat components/domain/CSS не удаляются этим slice; они считаются legacy и не получают новых Travel Foundation функций.
- Следующий server/data slice требует отдельного подтверждения и не начинается автоматически.

## Открыто после Travel Product Pivot

- real AI provider/model/routing/fallback policy;
- production Trip persistence/data schema/API;
- production transport/stay/map/legal/weather/currency providers;
- production database/provider region, backup/retention strategy;
- account linking/recovery и расширенные роли/permissions;
- production transactional-email provider/session topology;
- обработка и хранение travel-документов;
- финальные требования по персональным данным/consent/transborder transfer;
- billing/tariffs;
- production hosting;
- критерии real-data/AI closed beta и public release;
- дата публичного запуска.

## 2026-09-08 — Light AI-first Travel UI Redesign

Это решение **supersedes только пользовательскую Travel presentation model**, зафиксированную в `Travel Product Pivot Foundation V1`, где primary UI оставался dark/gold и навигация строилась вокруг `Главная · Поездки · Создать · Профиль`. Исторические решения выше сохраняются намеренно.

- Прежний dark/gold user-facing Travel UI больше не является основной пользовательской темой.
- Основная пользовательская Travel-тема — light: white / soft blue-white surfaces.
- Основная visual system — teal / turquoise / blue с restrained green accents и зелёно-синим primary gradient.
- Название, слоган и геометрия ARVELIS logo не меняются: сохраняются геометрическая `A`, круговая орбита и точечная дуга.
- Для светлого Travel UI допускается отдельный teal/blue gradient colorway того же знака; это не новый логотип.
- Home становится AI-first entry point с travel composer и starter prompts.
- Primary navigation становится left side drawer; legacy bottom navigation больше не является активной Travel navigation model.
- Trip Workspace остаётся структурированным результатом/объектом поездки, а AI становится центральным interaction layer.
- Profile упрощается до пользовательского account/travel UI; technical diagnostics выносятся в `Settings → Advanced / Diagnostics` и доступны только в test/dev context.
- ARVELIS AI архитектурно разделяется на `general` и `trip-scoped` contexts.
- Trip-scoped context передаёт будущему AI Gateway Trip identity/state без изменения существующих Trip contracts.
- Реальный AI Gateway в этом redesign slice не подключается; fake AI replies запрещены.
- Transport/Map/Legal/Weather/Stay/Currency/PDF providers в V2 не подключаются; отсутствующие функции показывают truthful states.
- Existing Trip domain, local persistence и auth/server foundation сохраняются и не переписываются ради presentation layer.
- Automated responsive acceptance целится в `390×844`, `844×390`, `360×800`, `1440×900`; physical iPhone Safari/VoiceOver остаётся отдельным manual acceptance item, если соответствующая среда недоступна.
- Следующий server/data/AI slice требует отдельного подтверждения и не начинается автоматически.

## 2026-09-09 — Server-side Trip Persistence & API V1

Это решение заменяет local-only persistence **только для реально authenticated Travel account** и сохраняет preview/local storage как отдельный тестовый контур.

- Server API V1: `GET /api/trips`, `GET /api/trips/:id`, `PUT /api/trips/:id`.
- `DELETE` в V1 намеренно отсутствует до отдельного решения по retention/deletion/recovery.
- Владение Trip определяется только authenticated HttpOnly session; client `ownerScopeId` не является authorization credential.
- Foreign-owned payload отклоняется; list/get всегда account-scoped.
- Trip ID scoped составным ключом `(account_id, id)`, поэтому одинаковые IDs разных аккаунтов не смешивают данные.
- `createdAt` и `updatedAt` являются server-authoritative.
- V1 хранит валидированный `Trip` как aggregate JSON document: SQLite `TEXT`, PostgreSQL `jsonb`; account/timestamps вынесены в authoritative columns.
- Выбрана additive migration `002_travel_trip_persistence`; auth migration `001` не переписывается, destructive migration не выполняется.
- Real-auth frontend переключается на same-origin HTTP repository за существующим repository boundary; preview остаётся local-only.
- Server failure не маскируется silent fallback-записью в browser localStorage.
- Mutations используют существующий same-origin request guard и bounded JSON body.
- Persistence CI оставляет только signal-bearing gates: high-severity audit, typecheck, SQLite business/ownership/migration, server build, один server-backed Chromium happy-path, frontend build и PostgreSQL migration/ownership PR gate.
- Browser happy-path проверяет `HttpOnly-compatible session → /api/trips → SQLite → reload → reopen` на `390×844` и не выдаёт preview/localStorage за server persistence.
- Во время slice обнаружены новые high-severity advisories Nodemailer `9.0.5`; dependency/lock обновлены до `9.1.1`, после чего audit вернулся к zero vulnerabilities.
- Временный self-mutating workflow для npm-generated lock удалён; финальный CI снова имеет `contents: read`.
- Production DB provider/region, backups, retention/export/deletion, real AI/provider integrations и production deployment этим решением не утверждены.
- После полного PostgreSQL PASS следующий согласованный slice — `Plan real-data contract / AI orchestration policy`; переход не означает автоматическое подключение конкретного AI vendor.
