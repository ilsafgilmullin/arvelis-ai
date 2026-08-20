# ARVELIS AI — дорожная карта

## Этап 1 — Product Foundation

- [x] Название и слоган.
- [x] Позиционирование.
- [x] Визуальное направление.
- [x] Логотип-концепция.
- [x] Репозиторий и рабочая ветка.
- [ ] Одна главная проблема первого AI MVP.
- [ ] Финальные границы AI MVP.
- [ ] Критерии готовности первого AI-релиза.

## Этап 2 — Brand Assets

- [ ] финальный `logo-full.svg`;
- [ ] финальный `logo-full-tagline.svg`;
- [x] чистый `logo-mark.svg` для preview;
- [ ] `logo-mark-small.svg`;
- [ ] `logo-full-light.svg`;
- [ ] `app-icon-512.png`;
- [ ] отдельный `favicon.svg`;
- [ ] `favicon-32.png`;
- [ ] `social-preview-1200x630.png`;
- [x] базовые UI design tokens в CSS;
- [ ] отдельный бренд-гайд и master-assets.

## Этап 3 — Runnable UX/UI Preview v0.2

- [x] mobile-first layout;
- [x] desktop layout;
- [x] welcome screen;
- [x] demo-auth screen;
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
- [ ] фактический smoke-test на iPhone через Replit Preview;
- [ ] фактический smoke-test на Android;
- [ ] фактический desktop browser smoke-test;
- [ ] визуальный QA после реального запуска.

Все demo/mock-данные явно маркируются. Никакой mock не выдаётся за AI/backend.

## Этап 4 — Technical Foundation

- [x] технический стек preview зафиксирован;
- [x] frontend разбит на компоненты, экраны, data/lib/hooks/types;
- [x] локальное demo-хранилище отделено от UI;
- [ ] подтверждённый CI build — GitHub hosted runner сейчас завершается до выполнения шагов;
- [ ] сгенерировать и закоммитить проверенный `package-lock.json`;
- [ ] утвердить production auth;
- [ ] утвердить модель данных;
- [ ] серверный API/gateway;
- [ ] логирование и обработка серверных ошибок;
- [ ] preview deployment policy.

## Этап 5 — AI MVP

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
