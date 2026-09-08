# ARVELIS AI — UI Guide

## 2026-09-08 — Light AI-first Travel UI

Это руководство описывает активный пользовательский Travel UI после `Travel UI Redesign V2`.

Предыдущее dark/gold пользовательское Travel-направление считается **superseded**. Историческая graphite/gold система остаётся частью истории бренда и legacy preview, но больше не является основной presentation model Travel-продукта.

## Visual direction

Основная тема:

- light;
- white / soft blue-white backgrounds;
- teal / turquoise / blue;
- restrained green accents;
- clean premium travel-tech character;
- больше воздуха и меньше технических рамок;
- карточки с лёгкой границей и soft shadow;
- travel visuals только там, где они объясняют продукт.

Не использовать:

- доминирующую золотую заливку;
- чёрный пользовательский Travel UI как primary theme;
- acid neon;
- cyberpunk / HUD;
- excessive glass effects;
- constant glow;
- fake maps, fake routes или postcard-noise;
- random external destination photography без media/provider policy.

## Brand

Геометрия ARVELIS не меняется:

- геометрическая `A`;
- круговая орбита;
- точечная правая дуга;
- ARVELIS AI wordmark structure.

Для light Travel UI разрешён отдельный teal/blue gradient colorway. Он не является новым логотипом и не меняет форму знака.

## Design tokens

V2 использует централизованные Travel tokens вместо размножения hex-значений:

- `--travel-background-primary`;
- `--travel-background-secondary`;
- `--travel-surface`;
- `--travel-surface-elevated`;
- `--travel-text-primary`;
- `--travel-text-secondary`;
- `--travel-border`;
- `--travel-accent-teal`;
- `--travel-accent-blue`;
- `--travel-accent-green`;
- `--travel-gradient-primary`;
- `--travel-success`;
- `--travel-warning`;
- `--travel-danger`;
- `--travel-focus`;
- `--travel-shadow-sm` / `--travel-shadow-md`;
- radius, spacing, touch и input sizes.

Минимальный touch target: `44px`. Базовая input height: `48px`.

## AI-first Home

Home — основной AI-first entry point.

Главная структура:

1. ARVELIS AI identity;
2. короткий travel-first heading `Куда отправимся?`;
3. большой composer;
4. starter prompts;
5. recent trips или truthful empty state;
6. editorial/static travel inspiration, явно не выдаваемая за персональную AI recommendation.

Starter prompt только заполняет composer и не отправляет запрос автоматически.

Voice и attachments не показываются как работающие функции до их фактической реализации.

## ARVELIS AI

Есть два UI-контекста:

### General

Для выбора направления, общих travel-вопросов, legal/transport идей и планирования до создания Trip.

### Trip-scoped

Контекст включает текущую поездку: `tripId`, origin/destination, dates, travelers, budget, preferences, itinerary, legal и map state.

UI не зависит от конкретного AI provider и должен позднее передавать эти контексты в AI Gateway без переписывания Chat surface.

Пока реальный AI не подключён:

- user message может отображаться;
- fake assistant reply запрещён;
- показывается truthful state `ARVELIS AI пока не подключён`.

## Primary navigation

Primary navigation — left side drawer.

Основные пункты:

- Главная;
- ARVELIS AI;
- Мои поездки;
- Создать поездку;
- Документы.

Сервисы:

- Маршруты;
- Бюджет;
- Travel Legal;
- Карта.

Аккаунт:

- Профиль;
- Настройки;
- Помощь.

Legacy bottom navigation не является активной Travel navigation model.

Drawer contract:

- left slide-in;
- overlay dismiss;
- Escape close;
- focus trap;
- focus return на menu button;
- `aria-expanded`, `aria-current`, semantic nav;
- body-scroll lock только во время открытия;
- safe-area aware layout;
- reduced motion support.

## My Trips

Trip cards показывают только persisted Trip data:

- направление;
- даты / flexible state;
- travelers;
- duration;
- user budget limit;
- status.

User-created draft не получает fake destination photo. Используется нейтральный visual slot.

Если поездок нет — один чистый empty state и один главный CTA.

## Create Trip

Presentation разделена на логические секции:

1. Основное;
2. Даты и путешественники;
3. Бюджет;
4. Предпочтения.

Сохраняются существующие domain validation и persistence boundaries.

Основной реальный CTA до подключения AI: `Сохранить поездку`.

Не показывать рабочую кнопку `Найти варианты с ARVELIS AI`, пока реального AI нет.

## Trip Workspace

Trip Workspace — структурированный результат работы пользователя и будущего AI.

Header содержит destination, dates, status и action `Спросить ARVELIS`.

Context navigation:

- Обзор;
- Маршрут;
- Карта;
- Бюджет;
- Документы;
- Legal;
- Trip Book.

На mobile tab strip прокручивается горизонтально внутри себя и не создаёт page overflow.

Keyboard: ArrowLeft / ArrowRight / Home / End.

## Truthful provider states

Если данные отсутствуют, UI говорит об этом прямо.

- Route: `Маршрут по дням пока пуст`;
- Map: provider не подключён, fake map не рисуется;
- Budget: показывается только пользовательский лимит, если нет реальных items;
- Legal: `Юридическая проверка ещё не выполнялась`;
- Documents: нет fake documents;
- Trip Book: PDF generation не выдаётся за доступную.

## Profile

Profile — пользовательский account screen, а не developer dashboard.

Основной слой:

- avatar;
- name;
- account identity;
- edit profile для preview-профиля;
- личные данные;
- travel preferences;
- security;
- documents;
- notifications;
- privacy;
- help;
- about;
- logout.

Technical diagnostics не находятся в основном Profile.

В development mode diagnostics доступны через `Settings → Advanced / Diagnostics`.

## Responsive

Обязательные размеры automated acceptance:

- `390×844`;
- `844×390`;
- `360×800`;
- `1440×900`.

Контракт:

- iPhone / Android mobile-first;
- `env(safe-area-inset-*)`;
- no horizontal page overflow;
- form controls остаются достижимыми при focus/keyboard;
- drawer не выходит за viewport;
- touch targets ≥44px;
- Trip tabs имеют internal horizontal scrolling;
- landscape остаётся usable phone layout.

## Accessibility

Обязательно:

- semantic `main`, `nav`, `form`, `label`, `button`;
- visible `focus-visible`;
- drawer focus trap;
- Escape;
- focus return;
- `aria-expanded`;
- `aria-current`;
- `aria-selected`;
- ≥44px touch targets;
- contrast не зависит от одного цвета;
- `prefers-reduced-motion`;
- screen-reader labels для icon-only controls.

Physical VoiceOver / Safari acceptance не заменяется Chromium и остаётся manual item, если реальный iPhone runner недоступен.

## Performance

- Home не должен загружать map SDK;
- real providers подключаются позже и lazy/on-demand;
- no heavy hero media blocking first paint;
- CSS/React presentation layer не должен тащить real provider dependencies;
- domain/auth/server boundaries остаются отдельными от UI.
