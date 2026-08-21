# ARVELIS AI — Home Foundation v1

Дата: 2026-08-21.
Ветка: `feat/home-foundation-v1`.
Статус: stacked frontend foundation поверх `feat/auth-foundation-v1`, без production auth/backend/AI.

## Зависимость ветки

Home v1 намеренно создаётся поверх Auth Foundation PR #11, потому что пользователь пока не выполняет runtime/merge-проверку, а source-level auth work завершён до внешних CI/lockfile gates.

Эта ветка **не должна сливаться в `main` раньше PR #11**.

После merge PR #11 Home-ветка может быть перепроверена/ретаргетирована на `main`.

## Роль Главной

`Главная` — product/info hub ARVELIS AI.

Она не является:

- вторым Chat composer;
- рекламным лендингом внутри приложения;
- административной панелью;
- ARVELIS CONTROL;
- местом для fake AI-метрик.

Главная должна быстро отвечать на четыре вопроса пользователя:

1. Где начать новый диалог?
2. К каким недавним разговорам можно вернуться?
3. Для каких задач создаётся ARVELIS AI?
4. Каков фактический статус текущей версии и данных?

## Информационная иерархия v1

### 1. Быстрый старт

Первый рабочий блок после Topbar:

- короткое позиционирование ARVELIS AI;
- основной CTA `Новый чат`;
- компактный `PRODUCT PREVIEW` status;
- данные = локально;
- AI = не подключён.

Никакого второго composer.

### 2. Недавние диалоги

Показываются максимум три текущих локальных thread.

Для каждого:

- название;
- count пользовательских/assistant conversation messages по существующей presentation policy;
- relative time;
- открытие thread в Chat.

Empty-state отдельно объясняет, что список появится после первого диалога.

### 3. Направления продукта

Используются только утверждённые области позиционирования из `docs/01_PRODUCT.md`:

- Работа;
- Учёба;
- Сложные задачи.

Copy намеренно сформулирован как направление продукта, а не как утверждение, что реальный AI уже выполняет эти функции.

Отдельная подпись прямо говорит, что это не обещание работающих AI-возможностей текущего preview.

### 4. Полезная информация

Два компактных блока:

- `Как пользоваться` — текущая UI-семантика одного контекста в одном диалоге;
- `Конфиденциальность` — текущие данные локальны, production DB/AI отсутствуют, секреты вводить нельзя.

## UX rationale

Предыдущая Home v2 была перегружена информационными карточками до полезного контента.

Home v1 reorganize:

`CTA → recent work → product directions → project info`.

Это делает Главную рабочей точкой приложения, а не внутренней презентацией продукта.

## Mobile-first contract

На width <= 780px:

- hero становится одной колонкой;
- primary CTA занимает доступную ширину;
- preview status идёт после CTA;
- direction/info grids становятся одной колонкой;
- recent rows не создают horizontal overflow;
- длинные слова/тексты безопасно переносятся;
- существующая bottom navigation остаётся источником основной навигации;
- safe-area handling остаётся в AppLayout;
- Home не вмешивается в Chat viewport-shell.

На <= 380px:

- hero headline уменьшается;
- section headings остаются читаемыми;
- preview facts не выходят за viewport.

## Accessibility

- один основной Home heading через `aria-labelledby` hero section;
- section headings имеют отдельные ids;
- preview status — `aside` с явным label;
- recent threads — настоящие buttons;
- disabled `Новый чат` использует существующий button state;
- empty/limit copy остаётся текстом, а не только цветовым сигналом.

## Truthfulness

Запрещено в Home preview:

- fake uptime;
- fake user count;
- fake online model status;
- fake provider/model name;
- fake cloud sync;
- выдавать product direction за работающую AI feature.

Разрешены только фактические состояния текущего frontend:

- PRODUCT PREVIEW;
- локальное хранение;
- AI не подключён;
- существующие локальные threads.

## Changed files

- `src/screens/WorkspaceScreen.tsx`;
- `src/home-foundation-v1.css`;
- `src/main.tsx`;
- `docs/30_HOME_FOUNDATION.md`.

## QA gate до merge Home

### Functional

- `Новый чат` открывает пустой Chat;
- thread limit disabled state сохраняется;
- recent row открывает правильный thread;
- empty recent state отображается при пустом workspace;
- Home не изменяет threads/data при простом просмотре.

### Mobile

- 320/360/390/430 px без horizontal overflow;
- primary CTA >= 44px touch target;
- cards/rows не перекрывают bottom navigation;
- portrait/landscape не переключают Home на неверную desktop navigation модель;
- текст не обрезается кроме намеренного ellipsis title в recent row.

### Desktop

- hero + compact status остаются сбалансированы;
- recent list читабелен;
- product directions = 3 columns на широком desktop;
- directions переходят в одну колонку на tablet <= 960px;
- info = 2 columns desktop / 1 mobile.

### Regression

- Splash/Auth/Smart Entry не меняются этой веткой;
- Chat v2 CSS/viewport-shell не меняются;
- History/Profile не меняются;
- ARVELIS CONTROL не импортируется;
- AI/backend/auth provider не подключаются.

## Remaining OPEN decisions

Home v1 не утверждает:

- одну главную проблему AI MVP;
- новые product features;
- model/provider;
- billing/tariffs;
- server account status;
- cloud sync;
- recommendations/personalization;
- отдельные Home subpages.
