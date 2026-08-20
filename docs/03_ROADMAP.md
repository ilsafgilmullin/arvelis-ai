# ARVELIS AI — дорожная карта

## Этап 1 — Product Foundation

- [x] Название и слоган.
- [x] Позиционирование.
- [x] Широкая целевая аудитория.
- [x] Визуальное направление.
- [x] Логотип-концепция.
- [x] Репозиторий и Git workflow.
- [x] Отдельный документ AI MVP readiness gates.
- [ ] Одна главная проблема первого AI MVP.
- [ ] Формальное утверждение основного AI-сценария.
- [ ] Финальные границы AI MVP.
- [ ] Production-модель данных.
- [ ] Уровни доступа.
- [ ] Финальные требования безопасности/персональных данных.
- [ ] Финальное утверждение ключевых экранов.
- [ ] Критерии готовности первого AI-релиза.

## Этап 2 — Brand Assets

- [ ] финальный `logo-full.svg`;
- [ ] финальный `logo-full-tagline.svg`;
- [x] чистый `logo-mark.svg` для preview;
- [x] `logo-mark-small.svg` с неизменённой геометрией знака;
- [ ] `logo-full-light.svg`;
- [ ] `app-icon-512.png`;
- [x] отдельный `favicon.svg` на базе утверждённого знака;
- [ ] `favicon-32.png`;
- [ ] `social-preview-1200x630.png`;
- [ ] `brand-preview.png`;
- [x] базовые UI design tokens в CSS;
- [ ] финальная vector typography/outline для full lockup;
- [ ] отдельный бренд-гайд и master-assets.

## Этап 3 — Runnable UX/UI Preview

- [x] mobile-first layout;
- [x] desktop layout;
- [x] welcome screen;
- [x] preview-access screen без реальной авторизации;
- [x] workspace;
- [x] интерактивный локальный chat flow;
- [x] поиск/удаление локальной истории;
- [x] profile/settings;
- [x] loading/empty/error/offline/limit states;
- [x] browser online/offline detection;
- [x] safe-area support;
- [x] reduced-motion support;
- [x] keyboard-aware mobile chat layout;
- [x] Replit Run configuration;
- [x] первичный фактический запуск и smoke-test текущего `main` на iPhone через Replit Preview;
- [x] первичный визуальный QA по реальным iPhone-скриншотам;
- [x] отдельный QA-hardening/product-polish candidate в `fix/qa-hardening-v1`;
- [ ] контрольный iPhone smoke-test QA candidate после разрешённого merge;
- [ ] фактический smoke-test на Android;
- [ ] фактический desktop browser smoke-test.

Все preview/mock-данные явно маркируются. Никакой mock не выдаётся за AI/backend.

## Этап 4 — Technical Foundation

- [x] технический стек **preview** зафиксирован;
- [x] frontend разбит на components/screens/data/lib/hooks/types;
- [x] локальное preview-хранилище отделено от UI;
- [x] Error Boundary и explicit storage/offline states добавлены в QA candidate;
- [ ] подтверждённый CI build — GitHub hosted runner сейчас завершается до выполнения полезных шагов;
- [ ] сгенерировать и закоммитить проверенный `package-lock.json`;
- [ ] утвердить **production** technical stack;
- [ ] утвердить production auth;
- [ ] утвердить production data model;
- [ ] серверный API/gateway;
- [ ] логирование и обработка серверных ошибок;
- [ ] preview deployment policy.

## Этап 5 — AI MVP

Не начинать до закрытия обязательных gate из `docs/06_MVP_GATES.md`.

- [ ] провайдер-независимый AI gateway;
- [ ] один основной AI-сценарий;
- [ ] таймауты, отмена, retry;
- [ ] rate/cost limits;
- [ ] серверная история;
- [ ] защита системных инструкций и данных.

## Этап 6 — Closed Beta

- [ ] ограниченная группа пользователей;
- [ ] аналитика сценариев;
- [ ] нагрузочные и мобильные проверки;
- [ ] security review;
- [ ] исправления по фактическим данным.

## Этап 7 — Production

- [ ] биллинг;
- [ ] поддержка;
- [ ] мониторинг;
- [ ] backup/recovery;
- [ ] юридические документы;
- [ ] публичное развёртывание.
