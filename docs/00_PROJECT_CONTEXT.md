# ARVELIS AI — контекст проекта

**Актуальность:** 2026-09-08.

## Статус

ARVELIS AI — новый профессиональный продукт в вертикали **AI Travel Assistant**. Текущий инженерный этап — `Travel Pivot Foundation V1`: перевести существующий frontend/product foundation с universal/chat-first модели на Trip-first Travel architecture, сохранив уже работающие brand/auth/server foundations.

## Источник истины

Источник истины для кода — текущий GitHub repository `ilsafgilmullin/arvelis-ai`, фактический `main` и рабочая ветка текущего slice.

Документация фиксирует продуктовые решения и ограничения, но не подменяет аудит репозитория.

## Утверждено

- Название: `ARVELIS AI`.
- Слоган: `INTELLIGENCE. PRECISION. RESULTS.`
- Вертикаль: `AI Travel Assistant`.
- Основной пользователь: русскоязычный самостоятельный путешественник; приоритетные форматы — одиночные поездки, пары, семьи и небольшие группы.
- География продукта: поездки по России и международные поездки.
- Приоритетные устройства: iPhone, Android, desktop.
- Базовая проблема: пользователю нужен один надёжный контур, который превращает бюджет, даты, состав, ограничения и предпочтения в проверяемый план поездки, а не набор разрозненных поисков и заметок.
- Основной объект домена: `Trip`.
- Главный продуктовый контур: `Главная → Мои поездки / Создать поездку → Trip Workspace → Профиль`.
- Ключевые продуктовые области: Plan, Transport, Budget, Legal, Map, Itinerary, Trip Book.
- Future-only направления: Live Companion и Safe/emergency capabilities.
- Бренд: строгий premium graphite + gold; утверждённая геометрия знака не меняется.
- Существующая Email OTP / Account / Session foundation сохраняется.
- Провайдеры должны быть заменяемыми; домен не привязывается к одному AI, transport, map или legal сервису.
- Real AI и внешние travel providers не входят в Travel Pivot Foundation V1.

## Superseded

Решением `2026-09-08 — Travel Product Pivot` superseded следующие продуктовые положения, но их исторические записи сохраняются в `docs/07_DECISIONS.md`:

- позиционирование ARVELIS как универсального AI-ассистента для работы/учёбы/повседневных задач;
- Chat как центральный объект и стартовый экран продукта;
- навигация `Главная · Чат · История · Профиль` как основной контур.

Chat-код не удаляется автоматически: он остаётся legacy infrastructure/history и может быть переиспользован позже как interaction layer внутри конкретного `Trip` после отдельного решения.

## Текущий technical state

На stable foundation уже существуют React 19, TypeScript 6, Vite 8, Node runtime, Replit configuration, clean ARVELIS brand mark, passwordless Email OTP auth, Account/Session, SQLite closed-test persistence, PostgreSQL-compatible auth persistence, CI и smoke tests.

Travel V1 добавляет отдельный `src/travel/` domain/persistence/provider boundary и Travel-first frontend composition. Travel data в этом slice хранится локально; это не production database.

## Остаётся OPEN

- конкретный real AI provider/model и routing policy;
- production Trip persistence/data schema и backend API;
- реальные transport/stay providers;
- map provider;
- production legal/weather/currency sources;
- обработка travel-документов и правила retention;
- production infrastructure/hosting/region;
- billing/subscriptions;
- production privacy/legal package и требования к персональным данным;
- дата public launch.
