# ARVELIS AI — архитектура

## Принципы

- mobile-first frontend;
- UI, доменная логика, данные и AI-интеграции разделяются;
- AI-слой в будущем должен быть провайдер-независимым;
- серверная авторизация и контроль доступа появятся только после отдельного security/design review;
- preview/mock отделяются от production;
- секреты хранятся только в защищённом окружении;
- GitHub `main` является источником истины после утверждённого merge;
- текущий preview не используется как оправдание преждевременной фиксации production backend/data model.

## Runnable Preview

Текущий тестовый frontend использует:

- React 19.2.8;
- React DOM 19.2.8;
- TypeScript 6.0.3;
- Vite 8.2.1;
- Node.js 22.12+; целевая LTS-линия runtime — Node 24;
- без router-зависимости;
- без UI framework;
- без backend;
- без реального AI;
- без реальной авторизации;
- без серверной базы данных;
- локальное preview-хранилище через `localStorage` браузера.

Это зафиксированный **preview stack**, а не финальное решение для production.

## Структура frontend

- `src/components/` — переиспользуемые элементы интерфейса, навигация и бренд-компоненты;
- `src/screens/` — основные экраны preview;
- `src/data/` — только явно обозначенные preview/mock-данные;
- `src/lib/` — локальная инфраструктура preview, валидация browser storage и Smart Entry preload orchestration;
- `src/hooks/` — изолированные browser hooks;
- `src/types.ts` — типы frontend-домена.

`App.tsx` выполняет роль composition/root state и не содержит разметку всех экранов.

## Smart Entry / preload model

Smart Entry не является декоративной задержкой. На входе параллельно выполняются реальные критические задачи:

1. загрузка App Layout + стартового ARVELIS AI экрана;
2. загрузка Chat module;
3. чтение/валидация локального preview-state.

Progress формируется только из завершённых задач. После готовности core-компоненты используются напрямую, чтобы не запускать второй full-screen `Suspense` loader.

History, Profile и System States остаются secondary chunks и прогреваются после первого экрана последовательно в idle/fallback режиме. Это снижает одновременную нагрузку на слабый телефон и не блокирует вход.

Критические dynamic imports имеют защитный timeout. Зависшая загрузка должна перейти в retry-state, а не оставаться бесконечной. Повторный/retry запуск защищён sequence token: устаревшая async-подготовка не должна перезаписывать более новый state/progress.

Никакая из этих оптимизаций не считается production caching/offline architecture. Service Worker/CDN/cache policy требуют отдельного решения перед релизом.

## CSS layers

Чтобы не переписывать работающую дизайн-систему целиком, стили разделены по ответственности:

1. `styles.css` — базовая дизайн-система и компоненты;
2. `mobile-polish.css` — mobile-specific исправления;
3. `qa-hardening.css` — destructive actions/QA элементы;
4. `runtime-polish.css` — runtime fallback и keyboard-aware поведение;
5. `layout-hardening.css` — narrow/tablet/landscape safe layout;
6. `product-polish.css` — последний визуальный слой продуктовой иерархии;
7. `post-merge-mobile-qa.css` — подтверждённые iPhone/WebView corrections;
8. `smart-entry.css` — Smart Entry, task/progress UI и lightweight screen transitions;
9. `smart-entry-responsive.css` — short-screen/landscape hardening загрузочного экрана;
10. `chat-experience.css` — conversation flow, mobile composer и visual cleanup чата после реального iPhone QA.

Последующие слои не должны самовольно менять утверждённую геометрию бренда.

## Replit runtime

Preview запускается на `0.0.0.0:3000`.

`.replit` связывает локальный порт 3000 с внешним портом 80 и выполняет установку зависимостей перед `npm run dev`, поэтому пользователь может тестировать проект кнопкой Run без Shell и без Replit Agent.

`package-lock.json` пока намеренно не зафиксирован: среда, в которой готовился preview, не имела рабочего доступа к npm registry. Перед production/closed beta lock-файл должен быть сгенерирован реальной установкой npm-зависимостей, проверен и закоммичен.

## Локальная preview-модель

Текущий preview умеет:

- создавать локальные диалоги;
- добавлять сообщения;
- искать и удалять историю;
- сохранять отображаемое имя;
- восстанавливать стартовые preview-данные;
- отслеживать online/offline состояние браузера;
- определять недоступность localStorage;
- валидировать сохранённую структуру до загрузки;
- нормализовать только известные legacy preview-copy без изменения пользовательского текста;
- схлопывать повторные известные preview-status до одного уведомления на диалог;
- не перезаписывать последнюю корректную локальную версию заведомо слишком большим/некорректным состоянием.

Эти функции не являются backend-функциями. Если localStorage недоступен, интерфейс продолжает работать в текущей сессии и явно предупреждает, что изменения могут исчезнуть после перезагрузки.

## Runtime safety preview

QA candidate включает:

- React Error Boundary вместо белого экрана;
- explicit offline/storage banners;
- confirm-dialog для разрушительных локальных действий;
- focus trap и возврат фокуса;
- safe-area/keyboard hardening;
- защиту от horizontal overflow длинных данных;
- short-screen/landscape hardening Smart Entry;
- отказ от постоянного filled `transform` после screen entrance animation, чтобы не создавать лишний containing block для fixed/mobile UI.

Это UX/runtime hardening, а не production security audit.

## Будущий AI gateway

Серверный слой должен:

- выбирать провайдера и модель;
- валидировать вход;
- применять системные политики;
- ограничивать стоимость и частоту;
- минимизировать чувствительные данные;
- журналировать только необходимые технические метаданные;
- поддерживать таймаут, отмену и повтор;
- не раскрывать API-ключи клиенту;
- позволять заменять AI-провайдера без переписывания UI/domain слоя.

Реализация gateway не начинается до закрытия обязательных gate из `docs/06_MVP_GATES.md`.
