# ARVELIS CONTROL — owner/admin control plane

Статус: frontend/control foundation, **без production backend и без реальной admin-auth**.
Дата: 2026-08-21.
Ветка: `feat/arvelis-control-v1`.

## Уже утверждено пользователем

ARVELIS CONTROL — отдельный административный сайт/центр управления ARVELIS AI для владельца и будущих администраторов.

Его назначение:

- видеть процессы и состояние продукта;
- получать единый обзор проблем;
- получать обращения в техническую поддержку;
- работать с такими обращениями из одного центра;
- со временем дать владельцу полный операционный контроль над проектом.

ARVELIS CONTROL **не является** пунктом пользовательской навигации ARVELIS AI и не должен быть доступен как обычная функция клиента.

## Архитектурное решение v1

CONTROL разрабатывается как отдельная frontend entry-point `/control/` в том же репозитории, а не как экран внутри пользовательского `App.tsx`.

Это позволяет:

- иметь отдельный URL и отдельный frontend bundle;
- позже вынести CONTROL на отдельный домен/поддомен без переписывания UI;
- использовать отдельную owner/admin session model;
- не смешивать public UX и внутренние operational tools;
- отдельно усиливать CSP, auth, access control и audit для control-plane.

На production CONTROL должен иметь отдельный origin и серверную authorization boundary. Точный домен пока OPEN.

## Frontend-preview scope

До backend можно реализовать:

1. **Обзор** — фактический статус модулей и продукта без фальшивых live-метрик.
2. **Поддержка** — inbox-layout и empty/error/offline states; реальные письма/тикеты пока не подключены.
3. **Проблемы** — operational work queue foundation без выдуманных production incidents.
4. **Процессы** — фактический статус текущих модулей: frontend preview / auth not connected / AI not connected / backend not connected.
5. **События** — audit/activity shell; реальный audit backend пока отсутствует.
6. **Настройки CONTROL** — архитектурные статусы и безопасные frontend preferences; production secrets сюда не помещаются.

Все demo/preview элементы должны быть явно маркированы.

## Security requirements до production

- отдельная owner/admin авторизация;
- серверная проверка ролей и permissions;
- принцип least privilege;
- MFA/passkey/step-up authentication — отдельное решение перед production;
- серверный immutable/tamper-resistant audit log для административных действий;
- session revoke/device management;
- rate limiting и защита от credential stuffing;
- никаких API keys/session secrets в frontend;
- CONTROL frontend не получает прямые DB credentials;
- support content и пользовательские данные должны иметь минимально необходимые права доступа;
- destructive/production actions должны иметь confirm/audit/rollback policy.

## OPEN — не считать утверждёнными

- точный домен CONTROL;
- перечень admin/owner/moderator ролей;
- способ owner login;
- support provider/email/helpdesk integration;
- user management actions;
- billing/refund tools;
- AI-provider/model controls;
- production infrastructure controls;
- какие действия требуют second factor / second approval;
- retention и доступ к пользовательским данным.

## UX direction

CONTROL сохраняет бренд ARVELIS, но визуально отличается от пользовательского приложения:

- более плотная operational layout;
- строгий graphite/gold;
- никаких decorative cosmic/HUD элементов;
- desktop-first для сложного управления, но usable на iPhone;
- ясные loading/empty/error/offline states;
- опасные действия визуально и семантически отделены.

## Definition of Done v1

Frontend foundation готов, когда:

- `/control/` собирается отдельно от пользовательского entry;
- CONTROL не импортируется пользовательским `App.tsx`;
- ни один экран не показывает выдуманные production-данные;
- Overview / Support / Problems / Processes / Events / Settings доступны в responsive shell;
- preview access явно не выдаётся за защищённую admin-auth;
- server-side access/auth/audit требования зафиксированы до подключения реальных данных.
