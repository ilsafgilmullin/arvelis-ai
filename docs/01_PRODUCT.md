# ARVELIS AI — продукт

## Официальное позиционирование

> **ARVELIS AI — интеллектуальный AI Travel Assistant полного цикла для самостоятельного путешественника.**

С 2026-09-08 это позиционирование supersedes прежний universal-AI product direction.

Ключевая формула продукта:

`BUDGET + TRANSPORT + TIME + COMFORT + LEGAL + MAP + ITINERARY + TRIP BOOK → ARVELIS AI`

## Целевой пользователь — APPROVED

Первичный пользователь — русскоязычный самостоятельный путешественник.

Приоритет:

- iPhone, Android и desktop;
- пары, одиночные путешественники, семьи и небольшие группы;
- поездки по России и международные поездки;
- путешествия с ограниченным бюджетом;
- работа в России без VPN там, где это технически и юридически возможно.

## Главная проблема — APPROVED

Планирование поездки разорвано между поиском транспорта, бюджетом, картами, визовыми/правовыми требованиями, заметками и программой по дням. Пользователю трудно понять не только «куда поехать», но и **реально ли поездка укладывается в деньги, время, комфорт и юридические ограничения**.

ARVELIS должен собирать эти ограничения в один проверяемый Trip workspace и явно отделять факты от предположений.

## Основной сценарий — APPROVED

Пример входа:

> «Мы вдвоём из Казани. Есть 120 000 ₽. Хотим на море на 7 дней в октябре. Не хотим сложных пересадок.»

Целевой полный цикл продукта:

1. принять параметры поездки;
2. помочь выбрать направление или работать с заданным;
3. найти и сравнить транспорт;
4. оптимизировать время/пересадки/комфорт;
5. рассчитать реальный бюджет;
6. проверить изменяемые legal requirements по источникам;
7. сформировать маршрут и программу по дням;
8. отобразить географию через Map provider;
9. собрать Trip Book;
10. в будущем сопровождать пользователя во время поездки.

## Основной объект — Trip

`Trip` — агрегат пользовательского путешествия. Chat не является корнем продуктовой модели. В будущем conversational interaction может быть добавлен внутри конкретной поездки, но история сообщений не должна определять storage/domain architecture Travel-продукта.

Статусы Trip:

- `draft`;
- `planning`;
- `ready`;
- `active`;
- `completed`;
- `archived`.

## Границы Travel MVP

Продуктовые модули, для которых закладываются границы:

- **Plan / Discover** — параметры, направление, предпочтения, itinerary;
- **Transport** — маршруты и сегменты разных видов транспорта;
- **Budget** — лимит, категории расходов, резерв и остаток;
- **Legal** — requirement + источник + даты проверки/действия;
- **Map** — provider-neutral географические точки/маршрут;
- **Trip Book** — единое представление материалов поездки.

`Live Companion` и `Safe` зафиксированы как future направления, а не scope текущего Foundation slice.

## Travel Pivot Foundation V1

В текущем slice пользователь может:

- открыть Travel-first Home;
- открыть `Создать поездку`;
- заполнить основные параметры;
- честно сохранить пользовательский Trip draft локально;
- увидеть поездку в `Мои поездки`;
- снова открыть её;
- перейти в Trip Workspace;
- увидеть foundation разделов Overview, Itinerary, Map, Budget, Documents, Legal и Trip Book.

В этом slice **нет** реального AI, поиска билетов/жилья, real map, legal conclusions, booking или payment.

## Truthfulness rule

User-created Trip data и sample/demo content — разные классы данных.

Запрещено выдавать за real data:

- выдуманные рейсы/поезда/автобусы;
- автоматически придуманные цены;
- гостиницы;
- визовые/правовые требования;
- AI-рекомендации;
- фиктивные географические маршруты.

Если provider отсутствует, UI показывает explicit empty/not-connected state.

## Excluded from Travel Pivot Foundation V1

- OpenAI/Gemini/Claude/другой real AI provider;
- production transport/rail/bus/flight search;
- booking/payment;
- paid map API;
- production Legal/Weather API;
- billing/subscriptions;
- production deploy/public registration rollout;
- AR navigation/offline maps;
- Live Companion/Safe automation;
- camera/voice/realtime assistant;
- Travel Memory;
- полноценная Group Travel система.

## Foundation success criteria

Foundation считается полезным, когда пользователь может создать принадлежащий ему Trip draft, закрыть/вернуться в интерфейс и снова открыть сохранённую поездку, а архитектура позволяет подключать real-data providers без переписывания UI вокруг одного vendor.
